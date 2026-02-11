/**
* Copyright © 2026 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

const Promise = require('bluebird')
const cp = require('child_process')
const r = require('rethinkdb')
const db = require('../../db')
const dbapi = require('../../db/api')
const logger = require('../../util/logger')
const lifecycle = require('../../util/lifecycle')

module.exports = function(options) {
  const log = logger.createLogger('virtual-device')
  const emulatorProcs = new Map()
  const activeActions = new Set()
  const stoppingDevices = new Set()

  if (options.name) {
    logger.setGlobalIdentifier(options.name)
  }

  const env = Object.assign({}, process.env)
  if (options.androidSdkRoot) {
    env.ANDROID_SDK_ROOT = options.androidSdkRoot
  }

  function normalizedAvdName(name) {
    return name.replace(/[^A-Za-z0-9._-]/g, '-')
  }

  function createAvdName(record) {
    const baseName = options.avdBaseName || 'stf-virtual'
    return normalizedAvdName(`${baseName}-${record.id}`)
  }

  function createActionError(err) {
    if (!err) {
      return 'Unknown error'
    }
    const stderr = err.stderr && err.stderr.trim()
    const stdout = err.stdout && err.stdout.trim()
    const base = err.message || String(err)
    const output = stderr || stdout
    const command = err.command ? ` (${err.command})` : ''
    return output ? `${base}${command}: ${output}` : `${base}${command}`
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

      const proc = cp.spawn(command, args, Object.assign({
        env: env
      }, spawnOptions || {}))

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

      if (spawnOptions && spawnOptions.input) {
        proc.stdin.write(spawnOptions.input)
        proc.stdin.end()
      }

      const timeout = spawnOptions && spawnOptions.timeout
      let timeoutId
      if (timeout) {
        timeoutId = setTimeout(function() {
          proc.kill('SIGKILL')
          finish(new Error('Command timed out'))
        }, timeout)
      }

      proc.on('close', function(code, signal) {
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
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

  function runAdb(args, opts) {
    return spawnCommand(options.adbPath, args, opts)
  }

  function runAvdManager(args, opts) {
    return spawnCommand(options.avdmanagerPath, args, opts)
  }

  function runEmulator(args, opts) {
    return cp.spawn(options.emulatorPath, args, Object.assign({env: env}, opts || {}))
  }

  function ensureAdbKeyboard(serial) {
    if (!options.adbKeyboardApkPath) {
      log.warn('ADB keyboard APK path missing; skip install for %s', serial)
      return Promise.resolve()
    }
    const imeId = options.adbKeyboardIme || 'com.android.adbkeyboard/.AdbIME'
    const installArgs = ['-s', serial, 'install', '-r', '-g', options.adbKeyboardApkPath]
    const enableArgs = ['-s', serial, 'shell', 'ime', 'enable', '--user', '0', imeId]
    const setArgs = ['-s', serial, 'shell', 'ime', 'set', '--user', '0', imeId]

    function getImeList() {
      return runAdb(['-s', serial, 'shell', 'ime', 'list', '-s'])
        .then(function(result) {
          const list = result.stdout || ''
          log.info('ADB keyboard IME list for %s: %s', serial, list.trim() || '(empty)')
          return list
        })
    }

    function hasAdbKeyboard(list) {
      return list.indexOf(imeId) !== -1
    }

    function attemptInstall(attempt) {
      log.info('ADB keyboard ensure attempt %d for %s', attempt + 1, serial)
      return getImeList()
        .catch(function(err) {
          log.warn('ADB keyboard IME list failed for %s: %s', serial, createActionError(err))
          return ''
        })
        .then(function(list) {
          if (!hasAdbKeyboard(list)) {
            log.info('ADB keyboard not found on %s, installing from %s', serial, options.adbKeyboardApkPath)
            return runAdb(installArgs).catch(function(err) {
              log.warn('ADB keyboard install failed for %s: %s', serial, createActionError(err))
              return null
            })
          }
          log.info('ADB keyboard already present on %s, skipping install', serial)
          return null
        })
        .then(function() {
          log.info('ADB keyboard enable for %s', serial)
          return runAdb(enableArgs).catch(function(err) {
            log.warn('ADB keyboard enable failed for %s: %s', serial, createActionError(err))
            return null
          })
        })
        .then(function() {
          log.info('ADB keyboard set for %s', serial)
          return runAdb(setArgs).catch(function(err) {
            log.warn('ADB keyboard set failed for %s: %s', serial, createActionError(err))
            return null
          })
        })
        .then(function() {
          return getImeList()
        })
        .then(function(list) {
          if (hasAdbKeyboard(list)) {
            log.info('ADB keyboard enabled for %s', serial)
            return true
          }
          if (attempt >= 4) {
            log.warn('ADB keyboard still missing for %s after %d attempts', serial, attempt + 1)
            return false
          }
          log.warn('ADB keyboard missing for %s after attempt %d', serial, attempt + 1)
          return Promise.delay(2000).then(function() {
            return attemptInstall(attempt + 1)
          })
        })
    }

    return attemptInstall(0)
  }

  function claimEmulatorPort(port, recordId) {
    return db.run(r.table('virtual_emulator_ports').insert({
      port: port
    , deviceId: recordId
    , createdAt: r.now()
    }, {conflict: 'error'}))
      .then(function(result) {
        if (result.inserted === 1) {
          return {claimed: true, port: port}
        }
        return db.run(r.table('virtual_emulator_ports').get(port))
          .then(function(existing) {
            return {claimed: false, port: port, existing: existing}
          })
      })
  }

  function reserveEmulatorPort(recordId, preferredPort) {
    let startPort = options.portMin
    if (startPort % 2 !== 0) {
      startPort += 1
    }

    function tryPort(port) {
      if (port > options.portMax) {
        throw new Error('No available emulator ports')
      }
      return claimEmulatorPort(port, recordId)
        .then(function(result) {
          if (result.claimed) {
            return port
          }
          if (result.existing && result.existing.deviceId === recordId) {
            return port
          }
          return tryPort(port + 2)
        })
    }

    if (preferredPort) {
      return claimEmulatorPort(preferredPort, recordId)
        .then(function(result) {
          if (result.claimed || (result.existing && result.existing.deviceId === recordId)) {
            return preferredPort
          }
          return tryPort(startPort)
        })
    }

    return tryPort(startPort)
  }

  function releaseEmulatorPort(record) {
    if (!record || !record.emulatorPort) {
      return Promise.resolve()
    }
    return db.run(r.table('virtual_emulator_ports').get(record.emulatorPort))
      .then(function(existing) {
        if (!existing) {
          return null
        }
        if (record.id && existing.deviceId && existing.deviceId !== record.id) {
          log.warn('Emulator port %s owned by %s, not %s', record.emulatorPort, existing.deviceId, record.id)
          return null
        }
        return db.run(r.table('virtual_emulator_ports').get(record.emulatorPort).delete())
      })
      .catch(function(err) {
        log.warn('Failed to release emulator port %s: %s', record.emulatorPort, err.message)
        return null
      })
  }

  function createAvd(record) {
    const avdName = record.avdName || createAvdName(record)
    const args = [
      'create', 'avd'
    , '-n', avdName
    , '-k', options.templateSystemImage
    , '--force'
    ]

    if (options.templateDevice) {
      args.push('-d', options.templateDevice)
    }
    if (options.templateSdcard) {
      args.push('--sdcard', options.templateSdcard)
    }

    log.info('Creating AVD "%s"', avdName)
    return runAvdManager(args, {input: 'no\n', timeout: options.createTimeout})
      .then(function() {
        return dbapi.updateVirtualDevice(record.id, {
          avdName: avdName
        })
      })
  }

  function waitForBoot(serial) {
    const timeoutAt = Date.now() + options.bootTimeout

    function waitForDevice() {
      return runAdb(['-s', serial, 'wait-for-device'], {timeout: options.bootTimeout})
    }

    function checkBoot() {
      return runAdb(['-s', serial, 'shell', 'getprop', 'sys.boot_completed'])
        .then(function(result) {
          if (result.stdout.trim() === '1') {
            return true
          }
          if (Date.now() > timeoutAt) {
            throw new Error('Boot timeout exceeded')
          }
          return Promise.delay(2000).then(checkBoot)
        })
    }

    return waitForDevice().then(checkBoot)
  }

  function handleEmulatorExit(id, code, signal) {
    emulatorProcs.delete(id)
    if (stoppingDevices.has(id)) {
      stoppingDevices.delete(id)
      return
    }
    return dbapi.getVirtualDevice(id).then(function(record) {
      if (!record || record.status === 'deleting') {
        return
      }
      const status = code === 0 ? 'stopped' : 'error'
      const lastError = code === 0 ? null : `Emulator exited with code ${code}`
      return dbapi.updateVirtualDevice(id, {
        status: status
      , lastError: lastError
      })
    })
  }

  function startEmulator(record) {
    return Promise.resolve().then(function() {
      if (!record.avdName) {
        throw new Error('Missing AVD name')
      }
      return record
    })
    .then(function(updated) {
      const current = updated || record
      if (!current.emulatorPort) {
        return reserveEmulatorPort(current.id).then(function(port) {
          return dbapi.updateVirtualDevice(current.id, {
            emulatorPort: port
          , serial: `emulator-${port}`
          })
        })
      }
      return reserveEmulatorPort(current.id, current.emulatorPort)
        .then(function(port) {
          if (port !== current.emulatorPort) {
            return dbapi.updateVirtualDevice(current.id, {
              emulatorPort: port
            , serial: `emulator-${port}`
            })
          }
          if (!current.serial) {
            return dbapi.updateVirtualDevice(current.id, {
              serial: `emulator-${port}`
            })
          }
          return current
        })
    })
    .then(function(updated) {
      const current = updated || record
      const args = [
        '-avd', current.avdName
      , '-port', String(current.emulatorPort)
      , '-no-snapshot-save'
      , '-no-snapshot-load'
      ]

      if (options.emulatorArgs && options.emulatorArgs.length) {
        args.push.apply(args, options.emulatorArgs)
      }

      log.info('Starting emulator "%s" on port %d', current.avdName, current.emulatorPort)
      const proc = runEmulator(args, {stdio: 'ignore'})
      emulatorProcs.set(current.id, proc)

      proc.on('exit', function(code, signal) {
        handleEmulatorExit(current.id, code, signal)
      })

      return dbapi.updateVirtualDevice(current.id, {
        status: 'starting'
      , lastError: null
      })
      .then(function() {
        return waitForBoot(current.serial)
      })
      .then(function() {
        return ensureAdbKeyboard(current.serial)
      })
      .then(function() {
        return dbapi.updateVirtualDevice(current.id, {
          status: 'running'
        , lastError: null
        })
      })
    })
  }

  function stopEmulator(record) {
    if (!record.serial && record.emulatorPort) {
      record.serial = `emulator-${record.emulatorPort}`
    }
    if (!record.serial) {
      return Promise.reject(new Error('Missing emulator serial'))
    }
    stoppingDevices.add(record.id)
    return runAdb(['-s', record.serial, 'emu', 'kill'], {timeout: options.stopTimeout})
      .catch(function(err) {
        log.warn('Failed to stop emulator %s: %s', record.serial, err.message)
      })
      .then(function() {
        const proc = emulatorProcs.get(record.id)
        if (proc) {
          proc.kill('SIGTERM')
        }
      })
      .then(function() {
        return dbapi.updateVirtualDevice(record.id, {
          status: 'stopped'
        })
      })
      .finally(function() {
        stoppingDevices.delete(record.id)
      })
  }

  function deleteAvd(record) {
    if (!record.avdName) {
      return Promise.resolve()
    }
    log.info('Deleting AVD "%s"', record.avdName)
    return runAvdManager(['delete', 'avd', '-n', record.avdName], {timeout: options.deleteTimeout})
  }

  function removeDeviceRecord(record) {
    if (!record || !record.serial) {
      return Promise.resolve()
    }
    return dbapi.deleteDevice(record.serial)
      .catch(function(err) {
        log.warn('Failed to delete device record %s: %s', record.serial, err.message)
        return null
      })
  }

  function finalizeAction(record, updates) {
    return dbapi.updateVirtualDevice(record.id, Object.assign({}, updates, {
      requestedAction: null
    , requestedActionId: null
    , lastActionId: record.requestedActionId
    }))
  }

  function handleAction(record) {
    const action = record.requestedAction
    if (!action) {
      return Promise.resolve()
    }

    switch (action) {
      case 'create':
        return dbapi.updateVirtualDevice(record.id, {status: 'creating', lastError: null})
          .then(function(updated) {
            return reserveEmulatorPort(updated.id).then(function(port) {
              return dbapi.updateVirtualDevice(updated.id, {
                emulatorPort: port
              , serial: `emulator-${port}`
              })
            })
            .then(function(nextRecord) {
              return createAvd(nextRecord)
            })
            .then(function(nextRecord) {
              return startEmulator(nextRecord)
            })
          })
          .then(function(updated) {
            return finalizeAction(record, {
              status: (updated && updated.status) || 'running'
            })
          })
          .catch(function(err) {
            log.error('Create action failed: %s', createActionError(err))
            return dbapi.getVirtualDevice(record.id)
              .then(function(current) {
                return releaseEmulatorPort(current || record)
              })
              .then(function() {
                return finalizeAction(record, {
                  status: 'error'
                , lastError: createActionError(err)
                , emulatorPort: null
                , serial: null
                })
              })
          })
      case 'start':
        return dbapi.updateVirtualDevice(record.id, {status: 'starting', lastError: null})
          .then(function(updated) {
            return startEmulator(updated)
          })
          .then(function() {
            return finalizeAction(record, {status: 'running'})
          })
          .catch(function(err) {
            log.error('Start action failed: %s', createActionError(err))
            return finalizeAction(record, {
              status: 'error'
            , lastError: createActionError(err)
            })
          })
      case 'stop':
        return dbapi.updateVirtualDevice(record.id, {status: 'stopping', lastError: null})
          .then(function(updated) {
            return stopEmulator(updated)
          })
          .then(function() {
            return finalizeAction(record, {status: 'stopped'})
          })
          .catch(function(err) {
            log.error('Stop action failed: %s', createActionError(err))
            return finalizeAction(record, {
              status: 'error'
            , lastError: createActionError(err)
            })
          })
      case 'delete':
        return dbapi.updateVirtualDevice(record.id, {status: 'deleting', lastError: null})
          .then(function(updated) {
            return stopEmulator(updated)
              .catch(function() {
                return null
              })
              .then(function() {
                return removeDeviceRecord(updated)
              })
              .then(function() {
                return releaseEmulatorPort(updated)
              })
              .then(function() {
                return deleteAvd(updated)
              })
          })
          .then(function() {
            return dbapi.deleteVirtualDevice(record.id)
          })
          .catch(function(err) {
            log.error('Delete action failed: %s', createActionError(err))
            return finalizeAction(record, {
              status: 'error'
            , lastError: createActionError(err)
            })
          })
      default:
        return Promise.resolve()
    }
  }

  function onChange(change) {
    if (!change.new_val) {
      return
    }
    const record = change.new_val
    if (!record.requestedActionId ||
        record.requestedActionId === record.lastActionId) {
      return
    }
    if (activeActions.has(record.requestedActionId)) {
      return
    }
    activeActions.add(record.requestedActionId)
    handleAction(record)
      .finally(function() {
        activeActions.delete(record.requestedActionId)
      })
  }

  function startWatcher() {
    return db.run(r.table('virtual_devices').changes({includeInitial: true}), function(err, cursor) {
      if (err) {
        throw err
      }
      return cursor
    })
    .then(function(cursor) {
      cursor.each(function(err, data) {
        if (err) {
          log.error('Virtual device changefeed error: %s', err.stack || err.message)
          return
        }
        onChange(data)
      })
    })
  }

  lifecycle.observe(function() {
    emulatorProcs.forEach(function(proc) {
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
      log.fatal('Virtual device manager failed to start', err)
      lifecycle.fatal()
    })
}
