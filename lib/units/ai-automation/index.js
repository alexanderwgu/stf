/**
* Copyright © 2026 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

const cp = require('child_process')
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

  if (options.name) {
    logger.setGlobalIdentifier(options.name)
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

    const proc = cp.spawn(cmd.command, cmd.args, {
      cwd: options.agentRoot
    , env: Object.assign({}, process.env, options.env || {}, {
        ANDROID_SERIAL: task.serial
      })
    })

    runningTasks.set(task.id, proc)
    runningBySerial.set(task.serial, task.id)

    proc.stdout.on('data', function(data) {
      appendLogTail(task.id, data.toString())
    })
    proc.stderr.on('data', function(data) {
      appendLogTail(task.id, data.toString())
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
    .then(function(result) {
      runningTasks.delete(task.id)
      runningBySerial.delete(task.serial)
      const cachedLog = logTailByTask.get(task.id)
      logTailByTask.delete(task.id)
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
