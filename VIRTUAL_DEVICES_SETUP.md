# Virtual Devices Setup (STF)

This guide summarizes what we set up and how to get virtual devices working on
any new machine.

## What we changed in STF

- Added a virtual device manager that creates/starts/stops/deletes Android
  emulators and persists them in RethinkDB.
- Added API endpoints under `/api/v1/virtual-devices`.
- Added a **Virtual device +** button and a Virtual devices panel in the Devices UI.

## Prerequisites

- RethinkDB
- Node.js (per repo requirements)
- Android SDK tools: `adb`, `avdmanager`, `emulator`
- Java 17 (required by recent Android command-line tools)

## Install Android SDK command-line tools (macOS)

```bash
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
mkdir -p "$ANDROID_SDK_ROOT/cmdline-tools"

curl -L -o /tmp/cmdline-tools.zip \
  "https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip"

rm -rf /tmp/cmdline-tools
unzip -q /tmp/cmdline-tools.zip -d /tmp/cmdline-tools
rm -rf "$ANDROID_SDK_ROOT/cmdline-tools/latest"
mv /tmp/cmdline-tools/cmdline-tools "$ANDROID_SDK_ROOT/cmdline-tools/latest"
```

### Install Java 17 and SDK packages

```bash
brew install --cask temurin@17
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

yes | "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" --licenses
"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" "emulator"
```

### Install the correct system image for your CPU

Check your CPU:

```bash
uname -m
```

- **arm64** (Apple Silicon):
  ```bash
  "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
    "system-images;android-33;google_apis;arm64-v8a"
  ```
- **x86_64** (Intel):
  ```bash
  "$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
    "system-images;android-33;google_apis;x86_64"
  ```

## Start STF (local)

```bash
rethinkdb
```

In a separate terminal:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)

stf local \
  --virtual-android-sdk-root "$HOME/Library/Android/sdk" \
  --virtual-avdmanager-path "$HOME/Library/Android/sdk/cmdline-tools/latest/bin/avdmanager" \
  --virtual-emulator-path "$HOME/Library/Android/sdk/emulator/emulator" \
  --virtual-adb-path "$HOME/Library/Android/sdk/platform-tools/adb" \
  --virtual-template-system-image "system-images;android-33;google_apis;arm64-v8a" \
  --virtual-adb-keyboard-apk-path "/tmp/ADBKeyboard.apk"
```

Replace the system image if you are on Intel:

```bash
--virtual-template-system-image "system-images;android-33;google_apis;x86_64"
```

## Auto-install ADB Keyboard on every emulator

Download the APK once:

```bash
curl -L -o /tmp/ADBKeyboard.apk \
  https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk
```

Then add:

```bash
--virtual-adb-keyboard-apk-path "/tmp/ADBKeyboard.apk"
```

Open the app at `http://localhost:7100` and click **Virtual device +** on the
Devices page.

## Optional: Build UI assets

If you don’t see UI changes, rebuild the frontend:

```bash
npm install
npx gulp build
```

Then restart `stf local`.

## Common issues

- **`avdmanager` not found**: verify
  `"$HOME/Library/Android/sdk/cmdline-tools/latest/bin/avdmanager"` exists.
- **Java version mismatch**: ensure `JAVA_HOME` is set to Java 17 before
  launching `stf local`.
- **Emulator exits immediately on arm64**: use `arm64-v8a` system images.
