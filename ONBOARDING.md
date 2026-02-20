# Developer Onboarding

This guide covers the two repos that make up the AI phone automation platform:

- **stf/** — the web app (device management, UI, API, task queue)
- **AutoGLM/** — the AI agent (vision model + phone control loop)

STF manages the devices and lets users submit tasks through a browser. When a task is submitted, STF spawns an AutoGLM process that autonomously operates the phone.

---

## Architecture Overview

```
Browser ──► STF Web UI ──► REST API ──► RethinkDB (ai_tasks table)
                                              │
                                              ▼
                                     AI Automation Unit (watches for queued tasks)
                                              │
                                              ▼
                                     Spawns: python3 main.py --base-url ... --model ... "prompt"
                                              │
                                              ▼
                                     AutoGLM Agent Loop:
                                       screenshot ──► vision model ──► action ──► repeat
                                              │
                                              ▼
                                     ADB commands (tap, swipe, type) on the phone
```

---

## Part 1: STF (Smartphone Test Farm)

### Prerequisites

- Node.js >= 18.20.5
- RethinkDB >= 2.2
- ADB (Android Debug Bridge)
- GraphicsMagick, ZeroMQ 4+, Protocol Buffers, CMake 3.9+, pkg-config

### Quick Start

```bash
cd stf/
npm install
rethinkdb                # start database (separate terminal)
stf local                # starts everything on port 7100
```

Open `http://localhost:7100`. Log in (mock auth in dev mode), and you'll see connected devices.

### To enable AI automation, pass the AI flags:

```bash
stf local \
  --ai-agent-root /path/to/AutoGLM \
  --ai-model-base-url https://generativelanguage.googleapis.com \
  --ai-model-name gemini-3-flash-preview \
  --ai-api-key YOUR_KEY \
  --ai-lang en
```

Or set env vars (`STF_LOCAL_AI_AGENT_ROOT`, `STF_LOCAL_AI_MODEL_BASE_URL`, etc.).

### Project Structure

```
stf/
├── bin/stf                          # Entry point → lib/cli/please.js
├── lib/
│   ├── cli/
│   │   ├── index.js                 # Yargs command router
│   │   ├── local/index.js           # `stf local` — forks all 18 units
│   │   └── ai-automation/index.js   # CLI args for the AI unit
│   ├── units/
│   │   ├── ai-automation/index.js   # ★ Watches ai_tasks, spawns AutoGLM
│   │   ├── api/                     # REST API (Express)
│   │   │   ├── controllers/ai-tasks.js  # AI task CRUD endpoints
│   │   │   └── swagger/api_v1.yaml      # API spec
│   │   ├── app/                     # Web UI server
│   │   ├── provider/                # ADB device discovery
│   │   ├── device/                  # Per-device control worker
│   │   ├── virtual-device/          # Android emulator management
│   │   └── ...                      # 18 units total
│   ├── db/
│   │   ├── tables.js                # RethinkDB schema (all table definitions)
│   │   └── api.js                   # DB query functions
│   └── util/                        # Logger, lifecycle, ADB helpers
├── res/app/                         # AngularJS frontend
│   ├── control-panes/
│   │   └── ai/                      # ★ AI control panel
│   │       ├── ai.pug               # Template (run button, status, logs)
│   │       └── ai-controller.js     # Task CRUD, 10s auto-refresh
│   └── ...
└── agent_logs/{serial}/*.log        # Runtime logs from AutoGLM
```

### Database Tables

| Table | Primary Key | Purpose |
|---|---|---|
| `users` | email | User accounts |
| `devices` | serial | Physical device inventory |
| `groups` | id | Device booking/partitioning |
| `ai_tasks` | id | AI task queue (status: queued→running→completed/failed) |
| `ai_device_memory` | serial | Per-device context for the AI agent |
| `virtual_devices` | id | Emulator instances |

### AI Task Lifecycle

1. User clicks "Run AI task" in the UI → `POST /api/v1/ai/devices/{serial}/tasks`
2. Task inserted into `ai_tasks` with `status: queued`
3. `ai-automation` unit picks it up via RethinkDB changefeed
4. Unit loads device memory (previous session context), enriches the prompt
5. Spawns `python3 main.py ...` in the AutoGLM directory
6. Streams stdout/stderr to `agent_logs/` and `ai_tasks.logTail`
7. On exit: updates status, summarizes device state via LLM, stores in `ai_device_memory`

### Key AI Config Flags

| Flag | Default | Description |
|---|---|---|
| `--ai-agent-root` | (required) | Path to the AutoGLM repo |
| `--ai-python-path` | `python3` | Python interpreter |
| `--ai-model-base-url` | (required) | LLM API endpoint |
| `--ai-model-name` | `autoglm-phone-9b` | Model identifier |
| `--ai-api-key` | (none) | API key for the model service |
| `--ai-lang` | `en` | Prompt language (`en` or `cn`) |
| `--ai-log-tail-max` | `4000` | Max chars of log kept in DB |
| `--ai-memory-summary-enabled` | `true` | LLM-based device state summarization |

---

## Part 2: AutoGLM (Phone Agent)

### Prerequisites

- Python 3.10+
- ADB installed and on PATH (for Android)
- A connected Android device or emulator
- ADB Keyboard APK installed on the device (for text input)

### Quick Start

```bash
cd AutoGLM/
pip install -r requirements.txt
pip install -e .

# Single task
python main.py \
  --model gemini-3-flash-preview \
  --apikey YOUR_KEY \
  --lang en \
  "Open Instagram and like the first post"

# Interactive mode (prompts for tasks)
python main.py --model gemini-3-flash-preview --apikey YOUR_KEY --lang en
```

### Project Structure

```
AutoGLM/
├── main.py                           # CLI entry point, arg parsing, system checks
├── phone_agent/
│   ├── agent.py                      # ★ PhoneAgent — the core loop
│   ├── agent_ios.py                  # iOS variant
│   ├── device_factory.py             # Routes to adb/hdc/xctest backends
│   ├── adb/                          # Android device control
│   │   ├── connection.py             #   USB/WiFi connection management
│   │   ├── device.py                 #   tap, swipe, back, home, launch_app
│   │   ├── input.py                  #   Text input via ADB Keyboard broadcasts
│   │   └── screenshot.py             #   Screen capture → resize → JPEG → base64
│   ├── hdc/                          # HarmonyOS (same interface as adb/)
│   ├── xctest/                       # iOS via WebDriverAgent
│   ├── model/
│   │   ├── client.py                 # OpenAI-compatible API client
│   │   ├── gemini_client.py          # Google Gemini client
│   │   └── __init__.py               # get_model_client() factory
│   ├── actions/
│   │   └── handler.py                # ★ Parses model output → executes on device
│   └── config/
│       ├── prompts_en.py             # English system prompt (action syntax, app context)
│       ├── prompts_zh.py             # Chinese system prompt
│       ├── apps.py                   # App name → Android package mapping
│       ├── apps_harmonyos.py         # App name → HarmonyOS package mapping
│       ├── apps_ios.py               # App name → iOS bundle ID mapping
│       └── timing.py                 # Action delays (all configurable via env vars)
```

### The Agent Loop

The entire agent lives in `phone_agent/agent.py`, method `_execute_step()`:

```
For each step (up to max_steps=100):
  1. Take screenshot via ADB          → base64 JPEG (resized to 540x1200)
  2. Get current app name             → e.g. "com.instagram.android"
  3. Build message: system prompt + screenshot + screen info
  4. Send to vision-language model    → streams thinking, then action
  5. Parse action from model output   → e.g. {"action": "Tap", "element": [500, 300]}
  6. Strip old screenshot from context (save tokens)
  7. Execute action on device via ADB → e.g. `adb shell input tap 540 720`
  8. If action is finish() → done. Otherwise → next step.
```

### Coordinate System

The model outputs coordinates in **0-1000 relative space**. The action handler converts them:

```
absolute_x = relative_x / 1000 * screen_width
absolute_y = relative_y / 1000 * screen_height
```

`screen_width`/`screen_height` are the original device dimensions (e.g., 1080x2400), even though the image sent to the model is resized.

### Available Actions

| Action | Example | What it does |
|---|---|---|
| `Tap` | `do(action="Tap", element=[500, 300])` | Tap at coordinates |
| `Type` | `do(action="Type", text="hello")` | Type text into focused input |
| `Swipe` | `do(action="Swipe", start=[500, 800], end=[500, 200])` | Swipe gesture |
| `Long Press` | `do(action="Long Press", element=[500, 300])` | Long press at coordinates |
| `Launch` | `do(action="Launch", app="Instagram")` | Open app by name |
| `Back` | `do(action="Back")` | Android back button |
| `Home` | `do(action="Home")` | Android home button |
| `Wait` | `do(action="Wait", duration="2 seconds")` | Pause |
| `Take_over` | `do(action="Take_over", message="...")` | Request human intervention |
| `finish` | `finish(message="Done.")` | End the task |

### Model Configuration

Two backends are supported:

**OpenAI-compatible** (default) — works with vLLM, SGLang, or any OpenAI-format API:
```bash
python main.py --base-url http://localhost:8000/v1 --model autoglm-phone-9b
```

**Google Gemini** — auto-detected when model name starts with `gemini-`:
```bash
python main.py --model gemini-3-flash-preview --apikey YOUR_GEMINI_KEY
```

### Key Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PHONE_AGENT_SCREENSHOT_MAX_DIM` | `1200` | Max screenshot dimension (px). `0` = no resize |
| `PHONE_AGENT_SCREENSHOT_JPEG_QUALITY` | `75` | JPEG quality (1-95) |
| `PHONE_AGENT_KEYBOARD_SWITCH_DELAY` | `1.0` | Seconds to wait after IME switch |
| `PHONE_AGENT_TAP_DELAY` | `1.0` | Seconds to wait after tap |
| `PHONE_AGENT_TEXT_INPUT_DELAY` | `1.0` | Seconds to wait after typing |

### System Prompts

The system prompt (`config/prompts_en.py`) tells the model:
- The output format (`<think>` reasoning + `<answer>` action)
- Available actions with syntax examples
- App-specific context (Instagram navigation, icon meanings, story creation flow, etc.)

To support a new app, add context to the system prompt describing its UI layout and common workflows.

### Python API Usage

```python
from phone_agent import PhoneAgent
from phone_agent.model import ModelConfig

agent = PhoneAgent(
    model_config=ModelConfig(
        base_url="https://generativelanguage.googleapis.com",
        model_name="gemini-3-flash-preview",
        api_key="YOUR_KEY",
        backend="gemini",
    )
)
result = agent.run("Open Settings and turn on WiFi")
```

---

## Common Development Tasks

### Adding support for a new app

1. Add the package name mapping in `AutoGLM/phone_agent/config/apps.py`
2. Add app-specific context to the system prompt in `config/prompts_en.py`
3. The more specific the prompt context (icon descriptions, navigation flows), the better the agent performs

### Running with an Android emulator

```bash
# In one terminal, start the emulator
emulator -avd Pixel_6_API_34

# In another, verify ADB sees it
adb devices   # should show emulator-5554

# Run the agent
python main.py -d emulator-5554 --model gemini-3-flash-preview --apikey KEY "task"
```

### Debugging a failed task

1. Check the log file in `stf/agent_logs/{serial}/{timestamp}.log`
2. The log shows each step: thinking (model reasoning), action (what it decided), and execution
3. Common issues:
   - Model outputs wrong coordinates → check if screenshot resolution is too low
   - Model gets stuck in a loop → check if the system prompt is missing context for that screen
   - Text input doesn't stick → the `Type` action requires the text editor to be focused first

### Adding a new action type

1. Add the handler method in `AutoGLM/phone_agent/actions/handler.py` (`_handle_xxx`)
2. Register it in the `handlers` dict in `_get_handler()`
3. Document the action syntax in the system prompt (`config/prompts_en.py`)

### Changing screenshot quality/size

Set env vars before running:
```bash
export PHONE_AGENT_SCREENSHOT_MAX_DIM=900    # smaller = cheaper, less accurate
export PHONE_AGENT_SCREENSHOT_JPEG_QUALITY=60 # lower = smaller payload
```
