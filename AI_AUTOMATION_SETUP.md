# AI Automation (Open-AutoGLM) Integration

This guide explains how to run Open-AutoGLM alongside STF and enable AI tasks
per device.

## Summary of integration

- Added an AI automation unit that runs Open-AutoGLM tasks per device.
- Added API endpoints under `/api/v1/ai/*` to create/cancel AI tasks.
- Added a **Run AI task** button and status badge on the device control page.

## Prerequisites

- Open-AutoGLM repo cloned locally
- Python 3.10+ with Open-AutoGLM dependencies installed
- A model service URL (local or hosted)
- ADB available (emulators or devices should already be visible in STF)

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

## Start STF with AI automation enabled

```bash
stf local \
  --ai-agent-root "/path/to/Open-AutoGLM" \
  --ai-python-path "python3" \
  --ai-model-base-url "http://localhost:8000/v1" \
  --ai-model-name "autoglm-phone-9b" \
  --ai-lang "en"
```

If you use an API key for the model service:

```bash
--ai-api-key "your-key"
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
