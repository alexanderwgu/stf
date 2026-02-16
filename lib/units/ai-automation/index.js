/**
* Copyright © 2026 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

const cp = require('child_process')
const fs = require('fs')
const http = require('http')
const https = require('https')
const path = require('path')
const Promise = require('bluebird')
const r = require('rethinkdb')
const url = require('url')

const db = require('../../db')
const dbapi = require('../../db/api')
const logger = require('../../util/logger')
const lifecycle = require('../../util/lifecycle')

module.exports = function(options) {
  const log = logger.createLogger('ai-automation')
  const runningTasks = new Map()
  const runningBySerial = new Map()
  const logTailByTask = new Map()
  const logFileByTask = new Map()
  const DEVICE_MEMORY_MAX_CHARS = 2400
  const DEVICE_MEMORY_FACTS_MAX = 12
  const DEVICE_MEMORY_FACT_MAX_CHARS = 180
  const MEMORY_SUMMARY_SYSTEM_PROMPT = [
    'You are a summarizer that records DEVICE STATE for a mobile phone, not task instructions.',
    'Return compact JSON only, no markdown and no extra text.',
    ''
    , 'CRITICAL RULES:'
    , '- shortTermSummary must describe the CURRENT STATE of the device (what is open,'
    , '  what account is logged in, what screen is showing), NOT what to do next.'
    , '- NEVER include imperative language like "open X", "tap Y", "search for Z".'
    , '- NEVER store task prompts or instructions verbatim. Describe outcomes, not actions.'
    , '- longTermFacts should be declarative observations (e.g. "Instagram is logged in as @user",'
    , '  "WiFi is connected to NetworkName"), not action history.'
    , '- Ignore repetitive setup diagnostics unless they caused failure.'
    , ''
    , 'Use this schema exactly:'
    , '{"shortTermSummary":"string","longTermFacts":["string"]}'
  ].join(' ')

  const logsRoot = path.resolve(process.cwd(), 'agent_logs')

  function sanitizeSegment(value) {
    return String(value || '')
      .trim()
      .replace(/[^A-Za-z0-9._-]/g, '-')
  }

  function taskLogTimestamp(date) {
    return date.toISOString().replace(/[:.]/g, '-')
  }

  function createTaskLogStream(task) {
    const serial = sanitizeSegment(task.serial || 'unknown')
    const deviceDir = path.join(logsRoot, serial)
    const fileName = `${taskLogTimestamp(new Date())}.log`
    const filePath = path.join(deviceDir, fileName)

    return fs.promises.mkdir(deviceDir, {recursive: true})
      .then(function() {
        const stream = fs.createWriteStream(filePath, {flags: 'a'})
        logFileByTask.set(task.id, {stream: stream, path: filePath})
        log.info('AI task log file for %s: %s', task.serial, filePath)
        return filePath
      })
  }

  function appendTaskLog(taskId, chunk) {
    const entry = logFileByTask.get(taskId)
    if (!entry || !entry.stream) {
      return
    }
    entry.stream.write(chunk)
  }

  function closeTaskLog(taskId) {
    const entry = logFileByTask.get(taskId)
    if (!entry || !entry.stream) {
      logFileByTask.delete(taskId)
      return
    }
    try {
      entry.stream.end()
    }
    catch (err) {
      // no-op
    }
    logFileByTask.delete(taskId)
  }

  function trimTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '')
  }

  function requestJson(method, targetUrl, headers, body) {
    return new Promise(function(resolve, reject) {
      const parsed = url.parse(targetUrl)
      const isHttps = parsed.protocol === 'https:'
      const client = isHttps ? https : http
      const payload = body ? JSON.stringify(body) : ''
      const req = client.request({
        protocol: parsed.protocol
      , hostname: parsed.hostname
      , port: parsed.port
      , path: parsed.path
      , method: method
      , headers: Object.assign({}, headers || {}, body ? {
          'Content-Type': 'application/json'
        , 'Content-Length': Buffer.byteLength(payload)
        } : {})
      }, function(res) {
        const chunks = []
        res.on('data', function(chunk) {
          chunks.push(chunk)
        })
        res.on('end', function() {
          const text = Buffer.concat(chunks).toString('utf8')
          const statusCode = res.statusCode || 0
          if (statusCode < 200 || statusCode >= 300) {
            return reject(new Error(`HTTP ${statusCode}: ${text.slice(0, 400)}`))
          }
          try {
            resolve(JSON.parse(text))
          }
          catch (err) {
            reject(new Error(`Invalid JSON response: ${text.slice(0, 400)}`))
          }
        })
      })
      req.on('error', reject)
      if (payload) {
        req.write(payload)
      }
      req.end()
    })
  }

  function limitText(value, max) {
    if (!value) {
      return ''
    }
    const text = String(value).trim()
    if (text.length <= max) {
      return text
    }
    return text.slice(0, max - 3) + '...'
  }

  function normalizeFacts(facts) {
    const source = Array.isArray(facts) ? facts : []
    const normalized = source
      .map(function(item) {
        return limitText(item, DEVICE_MEMORY_FACT_MAX_CHARS)
      })
      .filter(Boolean)
    return normalized.slice(-DEVICE_MEMORY_FACTS_MAX)
  }

  function isNoiseLogLine(line) {
    const text = String(line || '').trim()
    if (!text) {
      return true
    }
    return /^[-=]{6,}$/.test(text) ||
      /Checking system requirements/i.test(text) ||
      /Checking ADB installation/i.test(text) ||
      /Checking connected devices/i.test(text) ||
      /Checking ADB Keyboard/i.test(text) ||
      /All system checks passed/i.test(text) ||
      /Checking model API/i.test(text) ||
      /Checking API connectivity/i.test(text)
  }

  function selectRelevantLogLines(logTail) {
    const lines = String(logTail || '')
      .split(/\r?\n/)
      .map(function(line) {
        return line.trim()
      })
      .filter(Boolean)
    const useful = lines.filter(function(line) {
      if (isNoiseLogLine(line)) {
        return false
      }
      return /error|failed|exception|timeout|denied|blocked|captcha|verify|login|logged|opened|launch|tap|swipe|type|complete|success/i
        .test(line)
    })
    const picked = (useful.length ? useful : lines.filter(function(line) {
      return !isNoiseLogLine(line)
    })).slice(-14)
    return picked.join('\n')
  }

  function extractJsonObject(value) {
    const text = String(value || '').trim()
    if (!text) {
      return null
    }
    try {
      return JSON.parse(text)
    }
    catch (err) {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) {
        return null
      }
      try {
        return JSON.parse(match[0])
      }
      catch (e) {
        return null
      }
    }
  }

  function summarizeMemoryWithLlm(task, result, relevantLog, previousMemory) {
    if (options.memorySummaryEnabled === false) {
      return Promise.resolve(null)
    }
    const baseUrl = trimTrailingSlash(options.modelBaseUrl)
    if (!baseUrl) {
      return Promise.resolve(null)
    }
    const targetUrl = baseUrl + '/chat/completions'
    const model = options.memorySummaryModel || options.modelName
    const previousSummary = limitText(previousMemory && previousMemory.shortTermSummary, 900)
    const previousFacts = normalizeFacts(previousMemory && previousMemory.longTermFacts).join('\n')
    const status = result.code === 0 ? 'completed' : 'failed'
    const fallbackError = result.spawnError && result.error ?
      result.error.message :
      (result.code === 0 ? '' : `Exited with code ${result.code}`)
    const userPrompt = [
      'Produce a device state snapshot for this phone. Another AI agent will read this'
    , 'as background context before working on a DIFFERENT task, so:'
    , '- Describe the device STATE (what app is open, what account is logged in, what screen is showing).'
    , '- Do NOT include instructions, task prompts, or imperative language.'
    , '- Do NOT say things like "open X" or "the task was to Y". Instead say "X is currently open"'
    , '  or "Y was completed in a previous session".'
    , ''
    , `Last session outcome: ${status}`
    , `What was attempted: ${limitText(task.prompt, 500)}`
    , `Error (if any): ${limitText(fallbackError, 300)}`
    , ''
    , 'Previous device state:'
    , previousSummary || '(none)'
    , ''
    , 'Previous device facts:'
    , previousFacts || '(none)'
    , ''
    , 'Relevant execution logs:'
    , limitText(relevantLog, options.memorySummaryMaxInputChars || 5000) || '(none)'
    , ''
    , 'Return JSON with shortTermSummary (device state description) and longTermFacts'
    , '(declarative observations about the device) only.'
    ].join('\n')

    const headers = {}
    if (options.apiKey) {
      headers.Authorization = `Bearer ${options.apiKey}`
    }

    return requestJson('POST', targetUrl, headers, {
      model: model
    , temperature: 0.1
    , max_tokens: 350
    , messages: [
        {role: 'system', content: MEMORY_SUMMARY_SYSTEM_PROMPT}
      , {role: 'user', content: userPrompt}
      ]
    })
      .then(function(response) {
        const choice = response && response.choices && response.choices[0]
        const content = choice && choice.message && choice.message.content
        const parsed = extractJsonObject(content)
        if (!parsed) {
          return null
        }
        const summary = limitText(parsed.shortTermSummary, DEVICE_MEMORY_MAX_CHARS)
        const facts = normalizeFacts(parsed.longTermFacts)
        if (!summary && !facts.length) {
          return null
        }
        return {
          shortTermSummary: summary
        , longTermFacts: facts
        }
      })
      .catch(function(err) {
        log.warn('LLM memory summary failed for %s: %s', task.serial, err.message || err)
        return null
      })
  }

  function buildPromptWithMemory(prompt, memory) {
    if (!memory) {
      return prompt
    }

    const summary = limitText(memory.shortTermSummary, DEVICE_MEMORY_MAX_CHARS)
    const facts = normalizeFacts(memory.longTermFacts)
    if (!summary && !facts.length) {
      return prompt
    }

    const parts = [
      '## YOUR CURRENT TASK (this is your ONLY objective):'
    , prompt
    , ''
    , '---'
    , '## Background context from previous sessions on this device (READ-ONLY reference):'
    , 'The information below describes what happened in EARLIER, ALREADY-COMPLETED sessions.'
    , 'Do NOT re-execute or continue any past task. Only use this context if it helps you'
    , 'complete YOUR CURRENT TASK above (e.g. knowing which account is logged in, or that'
    , 'an app was already installed).'
    ]

    if (summary) {
      parts.push('')
      parts.push('Device state summary:')
      parts.push(summary)
    }

    if (facts.length) {
      parts.push('')
      parts.push('Known device facts:')
      facts.forEach(function(item) {
        parts.push('- ' + item)
      })
    }

    return parts.join('\n')
  }

  function buildMemoryUpdate(task, result, logTail, previousMemory, llmSummary) {
    const priorFacts = normalizeFacts(previousMemory && previousMemory.longTermFacts)
    const status = result.code === 0 ? 'completed' : 'failed'
    const shortPrompt = limitText(task.prompt, 320)
    const shortError = result.code === 0 ? '' : limitText(
      result.spawnError && result.error ? result.error.message : (logTail || `Exited with code ${result.code}`)
    , 400)
    const previousSummary = limitText(previousMemory && previousMemory.shortTermSummary, 800)
    const shortLog = limitText(selectRelevantLogLines(logTail), 700)

    // Build a state-oriented summary (not task-oriented)
    const parts = []
    if (previousSummary) {
      parts.push(previousSummary)
    }
    if (status === 'completed') {
      parts.push('Device was last used successfully.')
    }
    else if (shortError) {
      parts.push('Last session encountered an error: ' + shortError)
    }
    if (shortLog) {
      parts.push('Recent observations: ' + shortLog)
    }

    // Facts should describe device state, NOT store task prompts
    const facts = priorFacts.slice()
    if (result.code !== 0 && shortError) {
      facts.push('Last session error: ' + shortError)
    }

    return {
      shortTermSummary: llmSummary && llmSummary.shortTermSummary ?
          llmSummary.shortTermSummary :
          limitText(parts.join(' | '), DEVICE_MEMORY_MAX_CHARS)
    , longTermFacts: llmSummary && llmSummary.longTermFacts && llmSummary.longTermFacts.length ?
          normalizeFacts(priorFacts.concat(llmSummary.longTermFacts)) :
          normalizeFacts(facts)
    , lastPrompt: shortPrompt
    , lastStatus: status
    , lastError: shortError || null
    , lastLogExcerpt: shortLog || ''
    }
  }

  if (options.name) {
    logger.setGlobalIdentifier(options.name)
  }

  function spawnCommand(command, args, spawnOptions) {
    return new Promise(function(resolve, reject) {
      const chunks = {stdout: [], stderr: []}
      let finished = false

      function finish(err, result) {
        if (finished) {
          return
        }
        finished = true
        if (err) {
          reject(err)
        }
        else {
          resolve(result)
        }
      }

      const proc = cp.spawn(command, args, spawnOptions || {})

      proc.on('error', function(err) {
        err.command = [command].concat(args || []).join(' ')
        finish(err)
      })
      proc.stdout.on('data', function(data) {
        chunks.stdout.push(data)
      })
      proc.stderr.on('data', function(data) {
        chunks.stderr.push(data)
      })

      proc.on('close', function(code, signal) {
        const stdout = Buffer.concat(chunks.stdout).toString()
        const stderr = Buffer.concat(chunks.stderr).toString()
        if (signal) {
          const error = new Error(`Exited with signal ${signal}`)
          error.stdout = stdout
          error.stderr = stderr
          error.command = [command].concat(args || []).join(' ')
          finish(error)
          return
        }
        if (code !== 0) {
          const error = new Error(`Exited with status ${code}`)
          error.stdout = stdout
          error.stderr = stderr
          error.command = [command].concat(args || []).join(' ')
          finish(error)
          return
        }
        finish(null, {stdout: stdout, stderr: stderr})
      })
    })
  }

  function runAdb(serial, args) {
    const adbPath = options.adbPath || 'adb'
    return spawnCommand(adbPath, ['-s', serial].concat(args), {
      env: Object.assign({}, process.env, {
        ANDROID_SERIAL: serial
      })
    })
  }

  function ensureAdbKeyboard(serial) {
    const imeId = options.adbKeyboardIme || 'com.android.adbkeyboard/.AdbIME'
    const apkPath = options.adbKeyboardApkPath

    function getImeList() {
      return runAdb(serial, ['shell', 'ime', 'list', '-s'])
        .then(function(result) {
          const list = result.stdout || ''
          log.info('ADB keyboard IME list for %s: %s', serial, list.trim() || '(empty)')
          return list
        })
    }

    function hasIme(list) {
      return list.indexOf(imeId) !== -1
    }

    log.info('Ensuring ADB keyboard for %s (apk: %s, ime: %s)', serial, apkPath || '(none)', imeId)
    return getImeList()
      .catch(function(err) {
        log.warn('ADB keyboard IME list failed for %s: %s', serial, err.message)
        return ''
      })
      .then(function(list) {
        if (hasIme(list)) {
          log.info('ADB keyboard already enabled for %s', serial)
          return true
        }
        if (!apkPath) {
          log.warn('ADB keyboard missing for %s and no APK path provided', serial)
          return false
        }
        log.info('ADB keyboard missing for %s, installing from %s', serial, apkPath)
        return runAdb(serial, ['install', '-r', '-g', apkPath])
          .then(function(result) {
            if (result && (result.stdout || result.stderr)) {
              log.info('ADB keyboard install output for %s: %s %s', serial, result.stdout || '', result.stderr || '')
            }
          })
          .catch(function(err) {
            log.warn('ADB keyboard install failed for %s: %s', serial, err.message)
            if (err.stdout || err.stderr) {
              log.warn('ADB keyboard install stderr/stdout for %s: %s %s', serial, err.stdout || '', err.stderr || '')
            }
            return null
          })
          .then(function() {
            return runAdb(serial, ['shell', 'ime', 'enable', '--user', '0', imeId])
              .catch(function(err) {
                log.warn('ADB keyboard enable failed for %s: %s', serial, err.message)
                if (err.stdout || err.stderr) {
                  log.warn('ADB keyboard enable stderr/stdout for %s: %s %s', serial, err.stdout || '', err.stderr || '')
                }
                return null
              })
          })
          .then(function() {
            return runAdb(serial, ['shell', 'ime', 'set', '--user', '0', imeId])
              .catch(function(err) {
                log.warn('ADB keyboard set failed for %s: %s', serial, err.message)
                if (err.stdout || err.stderr) {
                  log.warn('ADB keyboard set stderr/stdout for %s: %s %s', serial, err.stdout || '', err.stderr || '')
                }
                return null
              })
          })
          .then(function() {
            return getImeList()
          })
          .then(function(nextList) {
            return hasIme(nextList)
          })
      })
      .then(function(ok) {
        if (!ok) {
          throw new Error('ADB Keyboard is not installed/enabled on the device')
        }
        return true
      })
  }

  function buildCommand(task, prompt) {
    const args = [
      'main.py'
    , '--base-url', options.modelBaseUrl
    , '--model', options.modelName
    , '--device-id', task.serial
    , prompt
    ]

    if (options.apiKey) {
      args.splice(1, 0, '--apikey', options.apiKey)
    }

    if (options.lang) {
      args.splice(1, 0, '--lang', options.lang)
    }

    return {
      command: options.pythonPath
    , args: args
    }
  }

  function appendLogTail(taskId, chunk) {
    const cached = logTailByTask.get(taskId) || ''
    const nextCached = (cached + chunk).slice(-options.logTailMax)
    logTailByTask.set(taskId, nextCached)

    return dbapi.getAiTask(taskId).then(function(task) {
      if (!task) {
        return null
      }
      const existing = task.logTail || ''
      const next = (existing + chunk).slice(-options.logTailMax)
      return dbapi.updateAiTask(taskId, {
        logTail: next
      })
    })
  }

  function startTask(task) {
    if (runningBySerial.has(task.serial)) {
      return dbapi.updateAiTask(task.id, {
        status: 'queued'
      , lastError: 'Another AI task is already running for this device'
      })
    }

    let memoryState = null
    let promptWithMemory = task.prompt
    let cmd = null
    log.info('Starting AI task %s for %s', task.id, task.serial)

    return dbapi.getAiDeviceMemory(task.serial)
      .catch(function(err) {
        log.warn('Failed to load AI memory for %s: %s', task.serial, err.message || err)
        return null
      })
      .then(function(memory) {
        memoryState = memory || null
        promptWithMemory = buildPromptWithMemory(task.prompt, memoryState)
        cmd = buildCommand(task, promptWithMemory)
      })
      .then(function() {
        return createTaskLogStream(task)
      })
      .then(function() {
        return ensureAdbKeyboard(task.serial)
      })
      .then(function() {
        if (!fs.existsSync(options.agentRoot)) {
          throw new Error(`AI agent root not found: ${options.agentRoot}`)
        }
        const proc = cp.spawn(cmd.command, cmd.args, {
          cwd: options.agentRoot
        , env: Object.assign({}, process.env, options.env || {}, {
            ANDROID_SERIAL: task.serial
          })
        })
        const resultPromise = new Promise(function(resolve) {
          proc.once('error', function(err) {
            resolve({code: 1, error: err, spawnError: true})
          })
          proc.once('exit', function(code, signal) {
            resolve({code: code, signal: signal})
          })
        })

        runningTasks.set(task.id, proc)
        runningBySerial.set(task.serial, task.id)

        proc.stdout.on('data', function(data) {
          const chunk = data.toString()
          appendLogTail(task.id, chunk)
          appendTaskLog(task.id, chunk)
        })
        proc.stderr.on('data', function(data) {
          const chunk = data.toString()
          appendLogTail(task.id, chunk)
          appendTaskLog(task.id, chunk)
        })

        return dbapi.updateAiTask(task.id, {
          status: 'running'
        , startedAt: r.now()
        , pid: proc.pid
        , lastError: null
        })
        .then(function() {
          return resultPromise
        })
      })
    .then(function(result) {
      runningTasks.delete(task.id)
      runningBySerial.delete(task.serial)
      const cachedLog = logTailByTask.get(task.id)
      logTailByTask.delete(task.id)
      closeTaskLog(task.id)
      const status = result.code === 0 ? 'completed' : 'failed'
      const error = result.code === 0 ? null :
        (result.spawnError ? result.error.message :
          (cachedLog ? cachedLog.slice(-600) : `Exited with code ${result.code}`))
      return dbapi.updateAiTask(task.id, {
        status: status
      , finishedAt: r.now()
      , exitCode: result.code
      , lastError: error
      })
      .then(function(updatedTask) {
        const relevantLog = selectRelevantLogLines(cachedLog)
        return summarizeMemoryWithLlm(task, result, relevantLog, memoryState)
          .then(function(llmSummary) {
            const memoryPatch = buildMemoryUpdate(task, result, cachedLog, memoryState, llmSummary)
            return dbapi.upsertAiDeviceMemory(task.serial, memoryPatch)
          })
          .catch(function(err) {
            log.warn('Failed to update AI memory for %s: %s', task.serial, err.message || err)
          })
          .then(function() {
            return updatedTask
          })
      })
    })
  }

  function handleChange(change) {
    if (!change.new_val) {
      return
    }

    const task = change.new_val
    if (task.status === 'queued') {
      startTask(task).catch(function(err) {
        runningTasks.delete(task.id)
        runningBySerial.delete(task.serial)
        closeTaskLog(task.id)
        dbapi.updateAiTask(task.id, {
          status: 'failed'
        , finishedAt: r.now()
        , lastError: err.message || String(err)
        })
      })
    }

    if (task.status === 'cancelled' && runningTasks.has(task.id)) {
      const proc = runningTasks.get(task.id)
      try {
        proc.kill('SIGTERM')
      }
      catch (err) {
        // No-op
      }
    }
  }

  function startWatcher() {
    return db.run(r.table('ai_tasks').changes({includeInitial: true}), function(err, cursor) {
      if (err) {
        throw err
      }
      return cursor
    })
    .then(function(cursor) {
      cursor.each(function(err, data) {
        if (err) {
          log.error('AI automation changefeed error: %s', err.stack || err.message)
          return
        }
        handleChange(data)
      })
    })
  }

  lifecycle.observe(function() {
    runningTasks.forEach(function(proc) {
      try {
        proc.kill('SIGTERM')
      }
      catch (err) {
        // No-op
      }
    })
  })

  db.setup()
    .then(startWatcher)
    .catch(function(err) {
      log.fatal('AI automation failed to start', err)
      lifecycle.fatal()
    })
}
