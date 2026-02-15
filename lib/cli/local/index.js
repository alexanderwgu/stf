/**
* Copyright © 2019 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

module.exports.command = 'local [serial..]'

module.exports.describe = 'Start a complete local development environment.'

module.exports.builder = function(yargs) {
  var os = require('os')

  return yargs
    .env('STF_LOCAL')
    .strict()
    .option('adb-host', {
      describe: 'The ADB server host.'
    , type: 'string'
    , default: '127.0.0.1'
    })
    .option('adb-port', {
      describe: 'The ADB server port.'
    , type: 'number'
    , default: 5037
    })
    .option('allow-remote', {
      alias: 'R'
    , describe: 'Whether to allow remote devices in STF. Highly ' +
        'unrecommended due to almost unbelievable slowness on the ADB side ' +
        'and duplicate device issues when used locally while having a ' +
        'cable connected at the same time.'
    , type: 'boolean'
    })
    .option('api-port', {
      describe: 'The port the api unit should run at.'
    , type: 'number'
    , default: 7106
    })
    .option('app-port', {
      describe: 'The port the app unit should run at.'
    , type: 'number'
    , default: 7105
    })
    .option('app-url', {
      describe: 'Publicly accessible URL to the app unit.'
    , type: 'string'
    })
    .option('auth-options', {
      describe: 'JSON array of options to pass to the auth unit.'
    , type: 'string'
    , default: '[]'
    })
    .option('auth-port', {
      describe: 'The port the auth unit should run at.'
    , type: 'number'
    , default: 7120
    })
    .option('auth-secret', {
      describe: 'The secret to use for auth JSON Web Tokens. Anyone who ' +
        'knows this token can freely enter the system if they want, so keep ' +
        'it safe.'
    , type: 'string'
    , default: 'kute kittykat'
    })
    .option('auth-type', {
      describe: 'The type of auth unit to start.'
    , type: 'string'
    , choices: ['mock', 'ldap', 'oauth2', 'saml2', 'openid']
    , default: 'mock'
    })
    .option('auth-url', {
      alias: 'a'
    , describe: 'URL to the auth unit.'
    , type: 'string'
    })
    .option('bind-app-dealer', {
      describe: 'The address to bind the app-side ZeroMQ DEALER endpoint to.'
    , type: 'string'
    , default: 'tcp://127.0.0.1:7112'
    })
    .option('bind-app-pub', {
      describe: 'The address to bind the app-side ZeroMQ PUB endpoint to.'
    , type: 'string'
    , default: 'tcp://127.0.0.1:7111'
    })
    .option('bind-app-pull', {
      describe: 'The address to bind the app-side ZeroMQ PULL endpoint to.'
    , type: 'string'
    , default: 'tcp://127.0.0.1:7113'
    })
    .option('bind-dev-dealer', {
      describe: 'The address to bind the device-side ZeroMQ DEALER endpoint to.'
    , type: 'string'
    , default: 'tcp://127.0.0.1:7115'
    })
    .option('bind-dev-pub', {
      describe: 'The address to bind the device-side ZeroMQ PUB endpoint to.'
    , type: 'string'
    , default: 'tcp://127.0.0.1:7114'
    })
    .option('bind-dev-pull', {
      describe: 'The address to bind the device-side ZeroMQ PULL endpoint to.'
    , type: 'string'
    , default: 'tcp://127.0.0.1:7116'
    })
    .option('cleanup', {
      describe: 'Attempt to reset the device between uses by uninstalling' +
        'apps, resetting accounts and clearing caches. Does not do a perfect ' +
        'job currently. Negate with --no-cleanup.'
    , type: 'boolean'
    , default: true
    })
    .option('cleanup-disable-bluetooth', {
      describe: 'Whether to disable Bluetooth during cleanup.'
    , type: 'boolean'
    , default: false
    })
    .option('cleanup-bluetooth-bonds', {
      describe: 'Whether to remove Bluetooth bonds during cleanup.'
    , type: 'boolean'
    , default: false
    })
    .option('cleanup-folder', {
      describe: 'Whether to remove pre-defined folder during cleanup. ' +
        'eg. "--cleanup-folder /data/local /tmp"'
    , type: 'array'
    , default: []
    })
    .option('group-timeout', {
      alias: 't'
    , describe: 'Timeout in seconds for automatic release of inactive devices.'
    , type: 'number'
    , default: 900
    })
    .option('lock-rotation', {
      describe: 'Whether to lock rotation when devices are being used. ' +
        'Otherwise changing device orientation may not always work due to ' +
        'sensitive sensors quickly or immediately reverting it back to the ' +
        'physical orientation.'
    , type: 'boolean'
    })
    .option('mute-master', {
      describe: 'Whether to mute master volume.'
    , choices: ['always', 'inuse', 'never']
    , default: 'never'
    , coerce: val => {
        if (val === true) {
          return 'inuse' // For backwards compatibility.
        }

        if (val === false) {
          return 'never' // For backwards compatibility.
        }

        return val
      }
    })
    .option('port', {
      alias: ['p', 'poorxy-port']
    , describe: 'The port STF should run at.'
    , type: 'number'
    , default: 7100
    })
    .option('provider', {
      describe: 'An easily identifiable name for the UI and/or log output.'
    , type: 'string'
    , default: os.hostname()
    })
    .option('provider-max-port', {
      describe: 'Highest port number for device workers to use.'
    , type: 'number'
    , default: 7700
    })
    .option('provider-min-port', {
      describe: 'Lowest port number for device workers to use.'
    , type: 'number'
    , default: 7400
    })
    .option('public-ip', {
      describe: 'The IP or hostname to use in URLs.'
    , type: 'string'
    , default: 'localhost'
    })
    .option('screen-reset', {
      describe: 'Go back to home screen and reset screen rotation ' +
        'when user releases device. Negate with --no-screen-reset.'
    , type: 'boolean'
    , default: true
    })
    .option('screen-ws-url-pattern', {
      describe: 'Publicly accessible URL pattern to use for the screen WebSocket.'
    , type: 'string'
    , default: 'ws://${publicIp}:${publicPort}'
    })
    .option('screen-frame-rate', {
      describe: 'Frame rate (frames/s) for device screen transport.'
    , type: 'number'
    , default: 12
    })
    .option('screen-jpeg-quality', {
      describe: 'JPEG quality for device screen transport.'
    , type: 'number'
    , default: 60
    })
    .option('screen-grabber', {
      describe: 'Screen capture tool (minicap-bin or minicap-apk).'
    , type: 'string'
    , default: 'minicap-apk'
    })
    .option('serial', {
      describe: 'Only use devices with these serial numbers.'
    , type: 'array'
    })
    .option('storage-options', {
      describe: 'JSON array of options to pass to the storage unit.'
    , type: 'string'
    , default: '[]'
    })
    .option('storage-plugin-apk-port', {
      describe: 'The port the storage-plugin-apk unit should run at.'
    , type: 'number'
    , default: 7104
    })
    .option('storage-plugin-image-port', {
      describe: 'The port the storage-plugin-image unit should run at.'
    , type: 'number'
    , default: 7103
    })
    .option('storage-port', {
      describe: 'The port the storage unit should run at.'
    , type: 'number'
    , default: 7102
    })
    .option('storage-type', {
      describe: 'The type of storage unit to start.'
    , type: 'string'
    , choices: ['temp', 's3']
    , default: 'temp'
    })
    .option('user-profile-url', {
      describe: 'URL to external user profile page'
    , type: 'string'
    })
    .option('vnc-initial-size', {
      describe: 'The initial size to use for the experimental VNC server.'
    , type: 'string'
    , default: '600x800'
    , coerce: function(val) {
        return val.split('x').map(Number)
      }
    })
    .option('virtual-adb-path', {
      describe: 'Path to adb binary for virtual devices.'
    , type: 'string'
    , default: 'adb'
    })
    .option('virtual-avdmanager-path', {
      describe: 'Path to avdmanager binary for virtual devices.'
    , type: 'string'
    , default: 'avdmanager'
    })
    .option('virtual-emulator-path', {
      describe: 'Path to emulator binary for virtual devices.'
    , type: 'string'
    , default: 'emulator'
    })
    .option('virtual-android-sdk-root', {
      describe: 'ANDROID_SDK_ROOT to use for virtual devices.'
    , type: 'string'
    })
    .option('virtual-adb-keyboard-apk-path', {
      describe: 'Path to ADB Keyboard APK to auto-install.'
    , type: 'string'
    })
    .option('virtual-adb-keyboard-ime', {
      describe: 'ADB Keyboard IME id to enable.'
    , type: 'string'
    , default: 'com.android.adbkeyboard/.AdbIME'
    })
    .option('virtual-template-system-image', {
      describe: 'System image for new virtual AVDs (sdkmanager ID).'
    , type: 'string'
    , default: 'system-images;android-33;google_apis;x86_64'
    })
    .option('virtual-template-device', {
      describe: 'Device profile to use for new virtual AVDs.'
    , type: 'string'
    , default: 'pixel'
    })
    .option('virtual-template-sdcard', {
      describe: 'SD card size for new virtual AVDs.'
    , type: 'string'
    , default: '512M'
    })
    .option('virtual-avd-base-name', {
      describe: 'Prefix for new virtual AVD names.'
    , type: 'string'
    , default: 'stf-virtual'
    })
    .option('virtual-port-min', {
      describe: 'Lowest emulator port to allocate for virtual devices.'
    , type: 'number'
    , default: 5554
    })
    .option('virtual-port-max', {
      describe: 'Highest emulator port to allocate for virtual devices.'
    , type: 'number'
    , default: 5680
    })
    .option('virtual-emulator-args', {
      describe: 'Extra args to pass to emulator (repeatable).'
    , type: 'array'
    , default: []
    })
    .option('virtual-boot-timeout', {
      describe: 'Virtual device boot completion timeout in ms.'
    , type: 'number'
    , default: 300000
    })
    .option('virtual-create-timeout', {
      describe: 'Virtual device AVD creation timeout in ms.'
    , type: 'number'
    , default: 120000
    })
    .option('virtual-stop-timeout', {
      describe: 'Virtual device stop timeout in ms.'
    , type: 'number'
    , default: 30000
    })
    .option('virtual-delete-timeout', {
      describe: 'Virtual device AVD delete timeout in ms.'
    , type: 'number'
    , default: 60000
    })
    .option('ai-agent-root', {
      describe: 'Path to Open-AutoGLM repository.'
    , type: 'string'
    })
    .option('ai-python-path', {
      describe: 'Python executable to run Open-AutoGLM.'
    , type: 'string'
    , default: 'python3'
    })
    .option('ai-model-base-url', {
      describe: 'Model service base URL.'
    , type: 'string'
    })
    .option('ai-model-name', {
      describe: 'Model name to use.'
    , type: 'string'
    , default: 'autoglm-phone-9b'
    })
    .option('ai-api-key', {
      describe: 'API key for the model service.'
    , type: 'string'
    })
    .option('ai-lang', {
      describe: 'Prompt language for AI automation (cn or en).'
    , type: 'string'
    , default: 'en'
    })
    .option('ai-log-tail-max', {
      describe: 'Maximum AI log tail characters to keep.'
    , type: 'number'
    , default: 4000
    })
    .option('ai-adb-path', {
      describe: 'Path to adb binary for AI automation.'
    , type: 'string'
    , default: 'adb'
    })
    .option('ai-adb-keyboard-apk-path', {
      describe: 'Path to ADB Keyboard APK to auto-install for AI automation.'
    , type: 'string'
    })
    .option('ai-adb-keyboard-ime', {
      describe: 'ADB Keyboard IME id to enable for AI automation.'
    , type: 'string'
    , default: 'com.android.adbkeyboard/.AdbIME'
    })
    .option('ai-memory-summary-enabled', {
      describe: 'Enable LLM-based per-device memory summaries.'
    , type: 'boolean'
    , default: true
    })
    .option('ai-memory-summary-model', {
      describe: 'Override model name for AI memory summaries.'
    , type: 'string'
    })
    .option('ai-memory-summary-max-input-chars', {
      describe: 'Max relevant log chars sent to memory summarizer.'
    , type: 'number'
    , default: 5000
    })
    .option('websocket-port', {
      describe: 'The port the websocket unit should run at.'
    , type: 'number'
    , default: 7110
    })
    .option('websocket-url', {
      describe: 'Publicly accessible URL to the websocket unit.'
    , type: 'string'
    })
    .epilog('Each option can be be overwritten with an environment variable ' +
      'by converting the option to uppercase, replacing dashes with ' +
      'underscores and prefixing it with `STF_LOCAL_` (e.g. ' +
      '`STF_LOCAL_ALLOW_REMOTE`).')
}

module.exports.handler = function(argv) {
  var util = require('util')
  var path = require('path')

  var Promise = require('bluebird')

  var logger = require('../../util/logger')
  var log = logger.createLogger('cli:local')
  var procutil = require('../../util/procutil')

  // Each forked process waits for signals to stop, and so we run over the
  // default limit of 10. So, it's not a leak, but a refactor wouldn't hurt.
  process.setMaxListeners(20)

  function run() {
    var procs = [
      // app triproxy
      procutil.fork(path.resolve(__dirname, '..'), [
          'triproxy', 'app001'
        , '--bind-pub', argv.bindAppPub
        , '--bind-dealer', argv.bindAppDealer
        , '--bind-pull', argv.bindAppPull
        ])

      // device triproxy
    , procutil.fork(path.resolve(__dirname, '..'), [
          'triproxy', 'dev001'
        , '--bind-pub', argv.bindDevPub
        , '--bind-dealer', argv.bindDevDealer
        , '--bind-pull', argv.bindDevPull
        ])

      // processor one
    , procutil.fork(path.resolve(__dirname, '..'), [
          'processor', 'proc001'
        , '--connect-app-dealer', argv.bindAppDealer
        , '--connect-dev-dealer', argv.bindDevDealer
        ])

      // processor two
    , procutil.fork(path.resolve(__dirname, '..'), [
          'processor', 'proc002'
        , '--connect-app-dealer', argv.bindAppDealer
        , '--connect-dev-dealer', argv.bindDevDealer
        ])

      // reaper one
    , procutil.fork(path.resolve(__dirname, '..'), [
          'reaper', 'reaper001'
        , '--connect-push', argv.bindDevPull
        , '--connect-sub', argv.bindAppPub
        ])

      // provider
    , procutil.fork(path.resolve(__dirname, '..'), [
          'provider'
        , '--name', argv.provider
        , '--min-port', argv.providerMinPort
        , '--max-port', argv.providerMaxPort
        , '--connect-sub', argv.bindDevPub
        , '--connect-push', argv.bindDevPull
        , '--group-timeout', argv.groupTimeout
        , '--public-ip', argv.publicIp
        , '--storage-url'
        , util.format('http://localhost:%d/', argv.port)
        , '--adb-host', argv.adbHost
        , '--adb-port', argv.adbPort
        , '--screen-frame-rate', argv.screenFrameRate
        , '--screen-jpeg-quality', argv.screenJpegQuality
        , '--screen-grabber', argv.screenGrabber
        , '--vnc-initial-size', argv.vncInitialSize.join('x')
        , '--mute-master', argv.muteMaster
        , '--screen-ws-url-pattern', argv.screenWsUrlPattern
        ]
        .concat(argv.allowRemote ? ['--allow-remote'] : [])
        .concat(argv.lockRotation ? ['--lock-rotation'] : [])
        .concat(!argv.cleanup ? ['--no-cleanup'] : [])
        .concat(argv.cleanupDisableBluetooth ? ['--cleanup-disable-bluetooth'] : [])
        .concat(argv.cleanupBluetoothBonds ? ['--cleanup-bluetooth-bonds'] : [])
        .concat(argv.cleanupFolder ? ['--cleanup-folder'].concat(argv.cleanupFolder) : [])
        .concat(!argv.screenReset ? ['--no-screen-reset'] : [])
        .concat(argv.serial))

      // auth
    , procutil.fork(path.resolve(__dirname, '..'), [
          util.format('auth-%s', argv.authType)
        , '--port', argv.authPort
        , '--secret', argv.authSecret
        , '--app-url', argv.appUrl || util.format(
            'http://%s:%d/'
          , argv.publicIp
          , argv.port
          )
        ].concat(JSON.parse(argv.authOptions)))

      // app
    , procutil.fork(path.resolve(__dirname, '..'), [
          'app'
        , '--port', argv.appPort
        , '--secret', argv.authSecret
        , '--auth-url', argv.authUrl || util.format(
            'http://%s:%d/auth/%s/'
          , argv.publicIp
          , argv.port
          , {
            oauth2: 'oauth'
          , saml2: 'saml'
          }[argv.authType] || argv.authType
          )
        , '--websocket-url', argv.websocketUrl || util.format(
            'http://%s:%d/'
          , argv.publicIp
          , argv.websocketPort
          )
        ].concat((function() {
          var extra = []
          if (argv.userProfileUrl) {
            extra.push('--user-profile-url', argv.userProfileUrl)
          }
          return extra
        })()))

      // api
    , procutil.fork(path.resolve(__dirname, '..'), [
          'api'
        , '--port', argv.apiPort
        , '--secret', argv.authSecret
        , '--connect-push', argv.bindAppPull
        , '--connect-sub', argv.bindAppPub
        , '--connect-push-dev', argv.bindDevPull
        , '--connect-sub-dev', argv.bindDevPub
      ])

      // groups engine
    , procutil.fork(path.resolve(__dirname, '..'), [
          'groups-engine'
        , '--connect-push', argv.bindAppPull
        , '--connect-sub', argv.bindAppPub
        , '--connect-push-dev', argv.bindDevPull
        , '--connect-sub-dev', argv.bindDevPub
      ])

      // websocket
    , procutil.fork(path.resolve(__dirname, '..'), [
          'websocket'
        , '--port', argv.websocketPort
        , '--secret', argv.authSecret
        , '--storage-url'
        , util.format('http://localhost:%d/', argv.port)
        , '--connect-sub', argv.bindAppPub
        , '--connect-push', argv.bindAppPull
        ])

      // virtual device manager
    , procutil.fork(path.resolve(__dirname, '..'), [
          'virtual-device'
        , '--adb-path', argv.virtualAdbPath
        , '--avdmanager-path', argv.virtualAvdmanagerPath
        , '--emulator-path', argv.virtualEmulatorPath
        , '--template-system-image', argv.virtualTemplateSystemImage
        , '--template-device', argv.virtualTemplateDevice
        , '--template-sdcard', argv.virtualTemplateSdcard
        , '--avd-base-name', argv.virtualAvdBaseName
        , '--port-min', argv.virtualPortMin
        , '--port-max', argv.virtualPortMax
        , '--boot-timeout', argv.virtualBootTimeout
        , '--create-timeout', argv.virtualCreateTimeout
        , '--stop-timeout', argv.virtualStopTimeout
        , '--delete-timeout', argv.virtualDeleteTimeout
        , '--adb-keyboard-apk-path', argv.virtualAdbKeyboardApkPath
        , '--adb-keyboard-ime', argv.virtualAdbKeyboardIme
        ]
        .concat(argv.virtualAndroidSdkRoot ? ['--android-sdk-root', argv.virtualAndroidSdkRoot] : [])
        .concat(argv.virtualEmulatorArgs.reduce(function(all, val) {
          return all.concat(['--emulator-args', val])
        }, [])))

      // ai automation
    , argv.aiAgentRoot && argv.aiModelBaseUrl ? procutil.fork(path.resolve(__dirname, '..'), [
          'ai-automation'
        , '--agent-root', argv.aiAgentRoot
        , '--python-path', argv.aiPythonPath
        , '--model-base-url', argv.aiModelBaseUrl
        , '--model-name', argv.aiModelName
        , '--lang', argv.aiLang
        , '--log-tail-max', argv.aiLogTailMax
        , '--adb-path', argv.aiAdbPath
        , '--adb-keyboard-ime', argv.aiAdbKeyboardIme
        , '--memory-summary-enabled', String(argv.aiMemorySummaryEnabled)
        , '--memory-summary-max-input-chars', argv.aiMemorySummaryMaxInputChars
        ]
        .concat(argv.aiApiKey ? ['--api-key', argv.aiApiKey] : [])
        .concat(argv.aiMemorySummaryModel ? ['--memory-summary-model', argv.aiMemorySummaryModel] : [])
        .concat((function() {
          var apkPath = argv.aiAdbKeyboardApkPath || argv.virtualAdbKeyboardApkPath
          return apkPath ? ['--adb-keyboard-apk-path', apkPath] : []
        })())) : null

      // storage
    , procutil.fork(path.resolve(__dirname, '..'), [
          util.format('storage-%s', argv.storageType)
        , '--port', argv.storagePort
        ].concat(JSON.parse(argv.storageOptions)))

      // image processor
    , procutil.fork(path.resolve(__dirname, '..'), [
          'storage-plugin-image'
        , '--port', argv.storagePluginImagePort
        , '--storage-url'
        , util.format('http://localhost:%d/', argv.port)
        ])

      // apk processor
    , procutil.fork(path.resolve(__dirname, '..'), [
          'storage-plugin-apk'
        , '--port', argv.storagePluginApkPort
        , '--storage-url'
        , util.format('http://localhost:%d/', argv.port)
        ])

      // poorxy
    , procutil.fork(path.resolve(__dirname, '..'), [
          'poorxy'
        , '--port', argv.port
        , '--app-url'
        , util.format('http://localhost:%d/', argv.appPort)
        , '--auth-url'
        , util.format('http://localhost:%d/', argv.authPort)
        , '--api-url'
        , util.format('http://localhost:%d/', argv.apiPort)
        , '--websocket-url'
        , util.format('http://localhost:%d/', argv.websocketPort)
        , '--storage-url'
        , util.format('http://localhost:%d/', argv.storagePort)
        , '--storage-plugin-image-url'
        , util.format('http://localhost:%d/', argv.storagePluginImagePort)
        , '--storage-plugin-apk-url'
        , util.format('http://localhost:%d/', argv.storagePluginApkPort)
        ])
    ].filter(Boolean)

    function shutdown() {
      log.info('Shutting down all child processes')
      procs.forEach(function(proc) {
        proc.cancel()
      })
      return Promise.settle(procs)
    }

    process.on('SIGINT', function() {
      log.info('Received SIGINT, waiting for processes to terminate')
    })

    process.on('SIGTERM', function() {
      log.info('Received SIGTERM, waiting for processes to terminate')
    })

    return Promise.all(procs)
      .then(function() {
        process.exit(0)
      })
      .catch(function(err) {
        log.fatal('Child process had an error', err.stack)
        return shutdown()
          .then(function() {
            process.exit(1)
          })
      })
  }

  return procutil.fork(path.resolve(__dirname, '..'), ['migrate'])
    .done(run)
}
