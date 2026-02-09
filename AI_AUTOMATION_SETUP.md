# AI Automation (Open-AutoGLM) Integration

This guide explains how to run Open-AutoGLM alongside STF and enable AI tasks
per device.

## Summary of integration

- Added an AI automation unit that runs Open-AutoGLM tasks per device.
- Added API endpoints under `/api/v1/ai/*` to create/cancel AI tasks.
- Added a **Run AI task** button and status badge on the device control page.

## Prerequisites

- Open-AutoGLM repo cloned locally (sibling of `stf` recommended)
- Python 3.10+ with Open-AutoGLM dependencies installed
- A model service URL (local or hosted)
- Android SDK tools: `adb`, `emulator`, `avdmanager`
- RethinkDB

## Open-AutoGLM setup

```bash
git clone https://github.com/zai-org/Open-AutoGLM.git
cd Open-AutoGLM
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

You also need a model service. For example (see Open-AutoGLM README for details):
- `--base-url` for a hosted service
- `--model` name (e.g. `autoglm-phone-9b`)

## Model service (z.ai)

Get an API key from z.ai and use:

- Base URL: `https://api.z.ai/api/paas/v4`
- Model: `autoglm-phone-multilingual`

Test directly from Open-AutoGLM:

```bash
python3 main.py \
  --base-url https://api.z.ai/api/paas/v4 \
  --model "autoglm-phone-multilingual" \
  --apikey "YOUR_ZAI_API_KEY" \
  "Open Chrome browser"
```

## Android SDK + system image (macOS)

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"

"$ANDROID_SDK_ROOT/cmdline-tools/latest/bin/sdkmanager" \
  "platform-tools" "emulator" \
  "system-images;android-30;google_apis;arm64-v8a"
```

## ADB Keyboard auto-install (recommended)

Download once:

```bash
curl -L -o /tmp/ADBKeyboard.apk \
  https://github.com/senzhk/ADBKeyBoard/raw/master/ADBKeyboard.apk
```

## Start STF with AI automation enabled

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
  --virtual-template-system-image "system-images;android-30;google_apis;arm64-v8a" \
  --virtual-adb-keyboard-apk-path "/tmp/ADBKeyboard.apk" \
  --ai-agent-root "/path/to/Open-AutoGLM" \
  --ai-python-path "python3" \
  --ai-model-base-url "https://api.z.ai/api/paas/v4" \
  --ai-model-name "autoglm-phone-multilingual" \
  --ai-api-key "YOUR_ZAI_API_KEY" \
  --ai-lang "en"
```

If you are on Intel, swap the system image:

```bash
--virtual-template-system-image "system-images;android-30;google_apis;x86_64"
```

## Using a .env file (recommended)

Create `stf/.env` with your settings:

```bash
STF_LOCAL_VIRTUAL_ANDROID_SDK_ROOT="$HOME/Library/Android/sdk"
STF_LOCAL_VIRTUAL_AVDMANAGER_PATH="$HOME/Library/Android/sdk/cmdline-tools/latest/bin/avdmanager"
STF_LOCAL_VIRTUAL_EMULATOR_PATH="$HOME/Library/Android/sdk/emulator/emulator"
STF_LOCAL_VIRTUAL_ADB_PATH="$HOME/Library/Android/sdk/platform-tools/adb"
STF_LOCAL_VIRTUAL_TEMPLATE_SYSTEM_IMAGE="system-images;android-30;google_apis;arm64-v8a"
STF_LOCAL_VIRTUAL_ADB_KEYBOARD_APK_PATH="/tmp/ADBKeyboard.apk"

STF_LOCAL_AI_AGENT_ROOT="/path/to/Open-AutoGLM"
STF_LOCAL_AI_PYTHON_PATH="python3"
STF_LOCAL_AI_MODEL_BASE_URL="https://api.z.ai/api/paas/v4"
STF_LOCAL_AI_MODEL_NAME="autoglm-phone-multilingual"
STF_LOCAL_AI_API_KEY="YOUR_ZAI_API_KEY"
STF_LOCAL_AI_LANG="en"
```

Start STF using the `.env` file:

```bash
set -a
source .env
set +a
stf local
```

## Use in the UI

1. Open a device in STF.
2. Click **Run AI task** (magic wand icon).
3. Enter a prompt like: `Open Chrome and search for coffee nearby`.
4. Watch the AI status badge for `running`, `completed`, or `failed`.

## API reference

- List all tasks: `GET /api/v1/ai/tasks`
- List tasks by device: `GET /api/v1/ai/devices/{serial}/tasks`
- Create task: `POST /api/v1/ai/devices/{serial}/tasks` with `{ "prompt": "..." }`
- Cancel task: `DELETE /api/v1/ai/tasks/{id}`

## Notes

- Only one AI task runs per device at a time.
- Tasks are executed by spawning Open-AutoGLM’s CLI for each prompt.
- ADB Keyboard must be enabled on each emulator; the `--virtual-adb-keyboard-apk-path`
  flag handles this automatically on boot.
