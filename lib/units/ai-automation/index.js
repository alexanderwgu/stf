/**
* Copyright © 2026 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

const cp = require('child_process')
const fs = require('fs')
const path = require('path')
const Promise = require('bluebird')
const r = require('rethinkdb')

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

  function buildCommand(task) {
    const args = [
      'main.py'
    , '--base-url', options.modelBaseUrl
    , '--model', options.modelName
    , '--device-id', task.serial
    , task.prompt
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

    const cmd = buildCommand(task)
    log.info('Starting AI task %s for %s', task.id, task.serial)

    return createTaskLogStream(task)
      .then(function() {
        return ensureAdbKeyboard(task.serial)
      })
      .then(function() {
        const proc = cp.spawn(cmd.command, cmd.args, {
          cwd: options.agentRoot
        , env: Object.assign({}, process.env, options.env || {}, {
            ANDROID_SERIAL: task.serial
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
          return new Promise(function(resolve) {
            proc.on('error', function(err) {
              resolve({code: 1, error: err, spawnError: true})
            })
            proc.on('exit', function(code, signal) {
              resolve({code: code, signal: signal})
            })
          })
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
