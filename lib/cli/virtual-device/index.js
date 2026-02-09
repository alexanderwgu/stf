/**
* Copyright © 2026 contains code contributed by Orange SA, authors: Denis Barbaron - Licensed under the Apache license 2.0
**/

module.exports.command = 'virtual-device'

module.exports.describe = 'Start the virtual device manager unit.'

module.exports.builder = function(yargs) {
  return yargs
    .strict()
    .env('STF_VIRTUAL')
    .option('adb-path', {
      describe: 'Path to adb binary.'
    , type: 'string'
    , default: 'adb'
    })
    .option('avdmanager-path', {
      describe: 'Path to avdmanager binary.'
    , type: 'string'
    , default: 'avdmanager'
    })
    .option('emulator-path', {
      describe: 'Path to emulator binary.'
    , type: 'string'
    , default: 'emulator'
    })
    .option('android-sdk-root', {
      describe: 'ANDROID_SDK_ROOT to use for SDK tools.'
    , type: 'string'
    })
    .option('adb-keyboard-apk-path', {
      describe: 'Path to ADB Keyboard APK to auto-install.'
    , type: 'string'
    })
    .option('adb-keyboard-ime', {
      describe: 'ADB Keyboard IME id to enable.'
    , type: 'string'
    , default: 'com.android.adbkeyboard/.AdbIME'
    })
    .option('template-system-image', {
      describe: 'System image for new AVDs (sdkmanager ID).'
    , type: 'string'
    , demand: true
    })
    .option('template-device', {
      describe: 'Device profile to use for new AVDs.'
    , type: 'string'
    , default: 'pixel'
    })
    .option('template-sdcard', {
      describe: 'SD card size (e.g. 512M) for new AVDs.'
    , type: 'string'
    , default: '512M'
    })
    .option('avd-base-name', {
      describe: 'Prefix for new AVD names.'
    , type: 'string'
    , default: 'stf-virtual'
    })
    .option('port-min', {
      describe: 'Lowest emulator port to allocate.'
    , type: 'number'
    , default: 5554
    })
    .option('port-max', {
      describe: 'Highest emulator port to allocate.'
    , type: 'number'
    , default: 5680
    })
    .option('emulator-args', {
      describe: 'Extra args to pass to emulator (repeatable).'
    , type: 'array'
    , default: []
    })
    .option('boot-timeout', {
      describe: 'Boot completion timeout in ms.'
    , type: 'number'
    , default: 300000
    })
    .option('create-timeout', {
      describe: 'AVD creation timeout in ms.'
    , type: 'number'
    , default: 120000
    })
    .option('stop-timeout', {
      describe: 'Emulator stop timeout in ms.'
    , type: 'number'
    , default: 30000
    })
    .option('delete-timeout', {
      describe: 'AVD delete timeout in ms.'
    , type: 'number'
    , default: 60000
    })
    .epilog('Each option can be be overwritten with an environment variable ' +
      'by converting the option to uppercase, replacing dashes with ' +
      'underscores and prefixing it with `STF_VIRTUAL_` (e.g. ' +
      '`STF_VIRTUAL_TEMPLATE_SYSTEM_IMAGE`).')
}

module.exports.handler = function(argv) {
  return require('../../units/virtual-device')({
    adbPath: argv.adbPath
  , avdmanagerPath: argv.avdmanagerPath
  , emulatorPath: argv.emulatorPath
  , androidSdkRoot: argv.androidSdkRoot
  , adbKeyboardApkPath: argv.adbKeyboardApkPath
  , adbKeyboardIme: argv.adbKeyboardIme
  , templateSystemImage: argv.templateSystemImage
  , templateDevice: argv.templateDevice
  , templateSdcard: argv.templateSdcard
  , avdBaseName: argv.avdBaseName
  , portMin: argv.portMin
  , portMax: argv.portMax
  , emulatorArgs: argv.emulatorArgs
  , bootTimeout: argv.bootTimeout
  , createTimeout: argv.createTimeout
  , stopTimeout: argv.stopTimeout
  , deleteTimeout: argv.deleteTimeout
  })
}
