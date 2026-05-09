# HumIntOS Backend

HumIntOS is a hackathon-ready realtime backend for a cinematic adaptive AI interface. It simulates and ingests cognitive, emotional, and behavioral signals, computes adaptive UI modes, and streams the whole system over WebSockets.

## Quick Start

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

From the repository root you can also run:

```bash
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

Open API docs:

```text
http://localhost:8000/docs
```

Realtime stream:

```text
ws://localhost:8000/ws/realtime
```

## Core Endpoints

```text
GET  /health
GET  /state/current
POST /emotion/analyze
POST /behavior/update
POST /assistant/respond
POST /demo/overload
POST /demo/focus
POST /demo/normalize
WS   /ws/realtime
```

## WebSocket Event Types

The frontend receives envelopes shaped like:

```json
{
  "type": "cognitive.state",
  "payload": {},
  "timestamp": "2026-05-09T..."
}
```

Important event types:

```text
cognitive.state
emotion.update
system.event
reasoning.log
assistant.status
assistant.response
behavior.analysis
```

The frontend can also send:

```json
{ "type": "ping", "payload": {} }
```

```json
{
  "type": "behavior.update",
  "payload": {
    "typing_speed": 42,
    "mouse_movement": 900,
    "click_frequency": 28,
    "inactivity_seconds": 6,
    "tab_switches": 2,
    "hesitation_ms": 1600,
    "correction_rate": 10
  }
}
```

```json
{ "type": "demo.trigger", "payload": { "scenario": "overload" } }
```

## Demo Flow

Use these during the hackathon presentation:

```bash
curl -X POST http://localhost:8000/demo/focus
curl -X POST http://localhost:8000/demo/overload
curl -X POST http://localhost:8000/demo/normalize
```

Each demo endpoint changes the cognitive state immediately, triggers adaptive mode evaluation, broadcasts events, and streams reasoning logs.

## Assistant

`/assistant/respond` adapts the tone automatically from the current cognitive state:

- `stress_mode`: calm, supportive, step-by-step
- `focus_mode`: concise, technical, direct
- `cognitive_overload_mode`: simplified, chunked, guided
- `normal_mode`: balanced and collaborative

If `OPENAI_API_KEY` is configured, HumIntOS uses OpenAI. If `OLLAMA_BASE_URL` is configured, it tries Ollama. Otherwise it returns deterministic adaptive MVP responses.

## Webcam Emotion

`/emotion/analyze` accepts an optional base64 image:

```json
{
  "image_base64": "data:image/jpeg;base64,...",
  "simulate": true
}
```

The engine uses OpenCV and MediaPipe when available, and gracefully falls back to believable simulation so the UI remains alive without sensors.
