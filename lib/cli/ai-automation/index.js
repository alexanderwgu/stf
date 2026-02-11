/**
* Copyright © 2026 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

module.exports.command = 'ai-automation'

module.exports.describe = 'Start the AI automation unit.'

module.exports.builder = function(yargs) {
  return yargs
    .strict()
    .env('STF_AI')
    .option('agent-root', {
      describe: 'Path to Open-AutoGLM repository.'
    , type: 'string'
    , demand: true
    })
    .option('python-path', {
      describe: 'Python executable to run Open-AutoGLM.'
    , type: 'string'
    , default: 'python3'
    })
    .option('model-base-url', {
      describe: 'Model service base URL.'
    , type: 'string'
    , demand: true
    })
    .option('model-name', {
      describe: 'Model name to use.'
    , type: 'string'
    , default: 'autoglm-phone-9b'
    })
    .option('api-key', {
      describe: 'API key for the model service.'
    , type: 'string'
    })
    .option('lang', {
      describe: 'Prompt language (cn or en).'
    , type: 'string'
    , default: 'en'
    })
    .option('log-tail-max', {
      describe: 'Maximum log tail characters to keep.'
    , type: 'number'
    , default: 4000
    })
    .option('adb-path', {
      describe: 'Path to adb binary.'
    , type: 'string'
    , default: 'adb'
    })
    .option('adb-keyboard-apk-path', {
      describe: 'Path to ADB Keyboard APK to auto-install when missing.'
    , type: 'string'
    })
    .option('adb-keyboard-ime', {
      describe: 'ADB Keyboard IME id to enable.'
    , type: 'string'
    , default: 'com.android.adbkeyboard/.AdbIME'
    })
    .epilog('Each option can be be overwritten with an environment variable ' +
      'by converting the option to uppercase, replacing dashes with ' +
      'underscores and prefixing it with `STF_AI_` (e.g. ' +
      '`STF_AI_AGENT_ROOT`).')
}

module.exports.handler = function(argv) {
  return require('../../units/ai-automation')({
    agentRoot: argv.agentRoot
  , pythonPath: argv.pythonPath
  , modelBaseUrl: argv.modelBaseUrl
  , modelName: argv.modelName
  , apiKey: argv.apiKey
  , lang: argv.lang
  , logTailMax: argv.logTailMax
  , adbPath: argv.adbPath
  , adbKeyboardApkPath: argv.adbKeyboardApkPath
  , adbKeyboardIme: argv.adbKeyboardIme
  })
}
