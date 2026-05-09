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

Hume realtime voice and TTS streams:

```text
ws://localhost:8000/ws/hume/evi
ws://localhost:8000/ws/hume/tts
```

## Core Endpoints

```text
GET  /health
GET  /state/current
POST /emotion/analyze
POST /emotion/text
POST /voice/tts
GET  /hume/status
POST /behavior/update
POST /assistant/respond
POST /demo/overload
POST /demo/focus
POST /demo/stress
POST /demo/normalize
WS   /ws/realtime
WS   /ws/hume/evi
WS   /ws/hume/tts
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
hume.emotion
hume.text_emotion
hume.transcription
hume.audio_output
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
curl -X POST http://localhost:8000/demo/stress
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

## Hume Emotion Intelligence

Set `HUME_API_KEY` in `backend/.env` to enable real Hume calls:

```bash
cp .env.example .env
# edit HUME_API_KEY and optionally HUME_CONFIG_ID
```

HumIntOS integrates:

- Hume EVI over `/ws/hume/evi` for microphone audio chunks, realtime transcription, prosody emotion scores, assistant messages, and audio output.
- Hume Expression Measurement over `/emotion/text` for emotional language analysis.
- Hume TTS over `/voice/tts` and `/ws/hume/tts` for expressive, state-adaptive speech.

The backend never sends the Hume API key to the frontend. Browser microphone audio should be captured in the frontend, encoded as base64 chunks, and sent to `/ws/hume/evi`:

```json
{
  "type": "audio_input",
  "payload": {
    "data": "base64-webm-or-pcm-audio-chunk"
  }
}
```

Text emotion analysis:

```bash
curl -X POST http://localhost:8000/emotion/text \
  -H 'Content-Type: application/json' \
  -d '{"text":"I am stuck and not sure what to do next","update_state":true}'
```

Expressive TTS:

```bash
curl -X POST http://localhost:8000/voice/tts \
  -H 'Content-Type: application/json' \
  -d '{"text":"Let us slow this down and take the next step together."}'
```

Hume-derived signals are fused into the live cognitive state:

```json
{
  "stress": 0.72,
  "confidence": 0.44,
  "empathy": 0.31,
  "hesitation": 0.66,
  "engagement": 0.58
}
```

Those signals update `stress_level`, `intent_confidence`, `hesitation_level`, `engagement_level`, adaptive modes, assistant tone, reasoning logs, and frontend WebSocket events.

Note: Hume's current docs say Expression Measurement is being sunset on June 14, 2026. EVI remains the preferred realtime voice path.
