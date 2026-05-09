from __future__ import annotations

import asyncio
import json
import time
from contextlib import suppress
from typing import Any, Dict, List, Mapping, Optional

from fastapi import WebSocket

from backend.adaptive_engine.engine import AdaptiveModeEngine
from backend.assistant_engine.engine import AdaptiveAssistantEngine
from backend.behavior_engine.engine import BehaviorAnalyticsEngine
from backend.cognitive_engine.engine import CognitiveStateEngine
from backend.demo_engine.engine import DemoModeEngine
from backend.emotion_engine.engine import EmotionAnalysisEngine
from backend.models.schemas import (
    AssistantRequest,
    AssistantResponse,
    BehaviorTelemetry,
    BehaviorUpdateResponse,
    CognitiveState,
    DemoResponse,
    EmotionAnalysisResponse,
    EmotionAnalyzeRequest,
    HumeEmotionSignals,
    HumeStatusResponse,
    ReasoningLog,
    RealtimeEnvelope,
    SystemEvent,
    TextEmotionRequest,
    TextEmotionResponse,
    TTSRequest,
    TTSResponse,
    model_to_dict,
)
from backend.services.events import SystemEventEngine
from backend.services.hume_ai import HumeAIService
from backend.utils.config import settings
from backend.websocket.manager import ConnectionManager


class SystemOrchestrator:
    def __init__(self) -> None:
        self.connections = ConnectionManager()
        self.cognition = CognitiveStateEngine()
        self.behavior = BehaviorAnalyticsEngine()
        self.emotion = EmotionAnalysisEngine()
        self.adaptive = AdaptiveModeEngine()
        self.assistant = AdaptiveAssistantEngine()
        self.demo = DemoModeEngine()
        self.events = SystemEventEngine()
        self.hume = HumeAIService()
        self._task: asyncio.Task[None] | None = None
        self._started_at = time.time()
        self._last_reasoning_at = 0.0

    @property
    def uptime_seconds(self) -> int:
        return int(time.time() - self._started_at)

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop(), name="humintos-orchestrator")

    async def stop(self) -> None:
        if not self._task:
            return
        self._task.cancel()
        with suppress(asyncio.CancelledError):
            await self._task
        self.emotion.close()

    async def current_state(self) -> CognitiveState:
        return await self.cognition.get_state()

    async def process_emotion(self, request: EmotionAnalyzeRequest) -> EmotionAnalysisResponse:
        state = await self.cognition.get_state()
        analysis = self.emotion.analyze(request.image_base64, state, request.simulate, request.metadata)
        updated_state = await self.cognition.apply_emotion_analysis(
            emotion=analysis.emotion,
            attention_score=analysis.attention_score,
            fatigue_level=analysis.fatigue_level,
            stress_probability=analysis.stress_probability,
        )
        decision = self.adaptive.evaluate(updated_state)
        updated_state = await self.cognition.set_adaptive_mode(decision.mode, decision.assistant_style)
        await self._broadcast_state(updated_state, "emotion.analyzed")
        await self._broadcast_adaptive_decision(decision)
        await self.connections.broadcast("emotion.update", model_to_dict(analysis))
        await self._broadcast_events(self.events.from_adaptive_decision(decision))
        return analysis

    async def process_text_emotion(self, request: TextEmotionRequest) -> TextEmotionResponse:
        state = await self.cognition.get_state()
        response = await self.hume.analyze_text(request, state)
        if request.update_state:
            response.state = await self._apply_hume_signals(response.signals, "hume.text")
        await self.connections.broadcast("hume.text_emotion", model_to_dict(response))
        return response

    async def synthesize_voice(self, request: TTSRequest) -> TTSResponse:
        state = await self.cognition.get_state()
        await self.connections.broadcast(
            "hume.tts.status",
            {"status": "synthesizing", "mode": state.active_mode, "configured": self.hume.configured},
        )
        response = await self.hume.synthesize_tts(request, state)
        await self.connections.broadcast(
            "hume.tts.status",
            {
                "status": "ready" if response.audio_chunks else "fallback",
                "provider": response.provider,
                "chunks": len(response.audio_chunks),
            },
        )
        return response

    def hume_status(self) -> HumeStatusResponse:
        return self.hume.status()

    async def process_behavior(self, telemetry: BehaviorTelemetry) -> BehaviorUpdateResponse:
        scores, deltas, behavior_events = self.behavior.analyze(telemetry)
        updated_state = await self.cognition.apply_behavior_deltas(deltas)
        decision = self.adaptive.evaluate(updated_state)
        updated_state = await self.cognition.set_adaptive_mode(decision.mode, decision.assistant_style)
        all_events = behavior_events + self.events.from_adaptive_decision(decision)
        await self._broadcast_state(updated_state, "behavior.updated")
        await self._broadcast_adaptive_decision(decision)
        await self._broadcast_events(all_events)
        response = BehaviorUpdateResponse(
            accepted=True,
            overload_score=scores["overload_score"],
            hesitation_score=scores["hesitation_score"],
            distraction_score=scores["distraction_score"],
            instability_score=scores["instability_score"],
            focus_loss_score=scores["focus_loss_score"],
            events=all_events,
            state=updated_state,
        )
        await self.connections.broadcast("behavior.analysis", model_to_dict(response))
        return response

    async def assistant_response(self, request: AssistantRequest) -> AssistantResponse:
        state = await self.cognition.get_state()
        await self.connections.broadcast(
            "assistant.status",
            {"status": "thinking", "mode": state.active_mode, "style": state.assistant_style},
        )
        response = await self.assistant.respond(request, state)
        await self.connections.broadcast("assistant.response", model_to_dict(response))
        await self.connections.broadcast("assistant.status", {"status": "idle", "mode": state.active_mode})
        return response

    async def trigger_demo(self, scenario_name: str) -> DemoResponse:
        updates, emotion, scenario_events, logs = self.demo.scenario(scenario_name)
        updated_state = await self.cognition.force_state(updates, emotion)
        decision = self.adaptive.evaluate(updated_state)
        updated_state = await self.cognition.set_adaptive_mode(decision.mode, decision.assistant_style)
        all_events = scenario_events + self.events.from_adaptive_decision(decision)
        await self._broadcast_state(updated_state, f"demo.{scenario_name}")
        await self._broadcast_adaptive_decision(decision, force=True)
        await self._broadcast_events(all_events, bypass_cooldown=True)
        await self._broadcast_logs(logs)
        return DemoResponse(scenario=scenario_name, state=updated_state, events=all_events, logs=logs)

    async def websocket_session(self, websocket: WebSocket) -> None:
        await self.connections.connect(websocket)
        try:
            state = await self.cognition.get_state()
            await self.connections.send(
                websocket,
                "system.welcome",
                {
                    "message": "HumIntOS realtime cognitive stream connected",
                    "state": model_to_dict(state),
                    "active_connections": self.connections.active_count,
                },
            )
            while True:
                raw = await websocket.receive_text()
                await self._handle_ws_message(websocket, raw)
        finally:
            await self.connections.disconnect(websocket)

    async def _handle_ws_message(self, websocket: WebSocket, raw: str) -> None:
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            await self.connections.send(websocket, "system.error", {"message": "Invalid JSON websocket message"})
            return

        event_type = message.get("type")
        payload = message.get("payload", {})

        if event_type == "ping":
            await self.connections.send(websocket, "pong", {"uptime_seconds": self.uptime_seconds})
        elif event_type == "behavior.update":
            response = await self.process_behavior(BehaviorTelemetry(**payload))
            await self.connections.send(websocket, "behavior.ack", model_to_dict(response))
        elif event_type == "emotion.analyze":
            response = await self.process_emotion(EmotionAnalyzeRequest(**payload))
            await self.connections.send(websocket, "emotion.ack", model_to_dict(response))
        elif event_type == "hume.text.analyze":
            response = await self.process_text_emotion(TextEmotionRequest(**payload))
            await self.connections.send(websocket, "hume.text.ack", model_to_dict(response))
        elif event_type == "hume.tts.synthesize":
            response = await self.synthesize_voice(TTSRequest(**payload))
            await self.connections.send(websocket, "hume.tts.ack", model_to_dict(response))
        elif event_type == "demo.trigger":
            scenario = payload.get("scenario", "normalize")
            if scenario not in {"overload", "focus", "stress", "normalize"}:
                await self.connections.send(websocket, "system.error", {"message": f"Unknown demo scenario: {scenario}"})
                return
            response = await self.trigger_demo(scenario)
            await self.connections.send(websocket, "demo.ack", model_to_dict(response))
        else:
            await self.connections.send(websocket, "system.ack", {"received": event_type or "unknown"})

    async def hume_evi_session(self, websocket: WebSocket) -> None:
        await websocket.accept()
        await self._send_ws_envelope(
            websocket,
            "hume.evi.status",
            {
                "status": "connecting" if self.hume.configured else "simulated",
                "configured": self.hume.configured,
                "message": "Send audio_input payloads containing base64 microphone chunks.",
            },
        )

        if not self.hume.configured:
            await self._simulated_hume_evi_session(websocket)
            return

        try:
            import websockets
        except Exception:
            await self._send_ws_envelope(
                websocket,
                "hume.evi.error",
                {"message": "The websockets package is required for the Hume EVI proxy."},
            )
            return

        try:
            async with websockets.connect(
                self.hume.evi_websocket_url(),
                max_size=16 * 1024 * 1024,
                ping_interval=20,
                ping_timeout=20,
            ) as hume_socket:
                await self._send_ws_envelope(
                    websocket,
                    "hume.evi.status",
                    {"status": "connected", "configured": True, "verbose_transcription": settings.hume_evi_verbose_transcription},
                )

                frontend_task = asyncio.create_task(self._frontend_to_hume_evi(websocket, hume_socket))
                hume_task = asyncio.create_task(self._hume_evi_to_frontend(websocket, hume_socket))
                done, pending = await asyncio.wait(
                    {frontend_task, hume_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                for task in done:
                    with suppress(asyncio.CancelledError):
                        await task
        except Exception as exc:
            with suppress(Exception):
                await self._send_ws_envelope(websocket, "hume.evi.error", {"message": self._safe_hume_error(exc)})
        finally:
            await self._close_ws(websocket)

    async def hume_tts_session(self, websocket: WebSocket) -> None:
        await websocket.accept()
        if not self.hume.configured:
            await self._send_ws_envelope(
                websocket,
                "hume.tts.error",
                {"message": "HUME_API_KEY is not configured. /voice/tts will return fallback text only."},
            )
            return

        try:
            import websockets
        except Exception:
            await self._send_ws_envelope(
                websocket,
                "hume.tts.error",
                {"message": "The websockets package is required for streaming Hume TTS."},
            )
            return

        try:
            async with websockets.connect(self.hume.tts_websocket_url(), ping_interval=20, ping_timeout=20) as hume_socket:
                await self._send_ws_envelope(websocket, "hume.tts.status", {"status": "connected", "instant_mode": True})
                frontend_task = asyncio.create_task(self._frontend_to_hume_tts(websocket, hume_socket))
                hume_task = asyncio.create_task(self._hume_tts_to_frontend(websocket, hume_socket))
                done, pending = await asyncio.wait(
                    {frontend_task, hume_task},
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                await asyncio.gather(*pending, return_exceptions=True)
                for task in done:
                    with suppress(asyncio.CancelledError):
                        await task
        except Exception as exc:
            with suppress(Exception):
                await self._send_ws_envelope(websocket, "hume.tts.error", {"message": self._safe_hume_error(exc)})
        finally:
            await self._close_ws(websocket)

    async def _loop(self) -> None:
        while True:
            state = await self.cognition.tick()
            decision = self.adaptive.evaluate(state)
            state = await self.cognition.set_adaptive_mode(decision.mode, decision.assistant_style)
            await self._broadcast_state(state, "cognition.tick")
            await self._broadcast_adaptive_decision(decision)
            await self._broadcast_events(self.events.from_adaptive_decision(decision) + self.cognition.build_state_events(state))

            now = time.monotonic()
            if now - self._last_reasoning_at >= settings.reasoning_tick_seconds:
                self._last_reasoning_at = now
                await self._broadcast_logs(self.cognition.build_reasoning_logs(state))

                simulated_emotion = self.emotion.analyze(None, state, simulate=True, metadata={"source": "orchestrator"})
                await self.connections.broadcast("emotion.update", model_to_dict(simulated_emotion))

            await asyncio.sleep(settings.websocket_tick_seconds)

    async def _broadcast_state(self, state: CognitiveState, source: str) -> None:
        await self.connections.broadcast(
            "cognitive.state",
            {
                **model_to_dict(state),
                "source": source,
            },
        )

    async def _broadcast_events(self, events: List[SystemEvent], bypass_cooldown: bool = False) -> None:
        accepted = events if bypass_cooldown else self.events.filter_cooldown(events)
        for event in accepted:
            await self.connections.broadcast("system.event", model_to_dict(event))

    async def _broadcast_adaptive_decision(self, decision: Any, force: bool = False) -> None:
        if decision.changed or force:
            await self.connections.broadcast("adaptive.mode", model_to_dict(decision))

    async def _broadcast_logs(self, logs: List[ReasoningLog]) -> None:
        for log in logs:
            await self.connections.broadcast("reasoning.log", model_to_dict(log))

    async def _apply_hume_signals(self, signals: HumeEmotionSignals, source: str) -> CognitiveState:
        updated_state = await self.cognition.apply_hume_signals(signals)
        decision = self.adaptive.evaluate(updated_state)
        updated_state = await self.cognition.set_adaptive_mode(decision.mode, decision.assistant_style)

        emotion_update = EmotionAnalysisResponse(
            emotion=signals.dominant_emotion,
            confidence=signals.confidence,
            attention_score=signals.engagement,
            fatigue_level=max(0.0, min(1.0, signals.hesitation * 0.45 + (1.0 - signals.engagement) * 0.35)),
            stress_probability=signals.stress,
            face_detected=False,
            landmarks_detected=False,
            source=source,
        )
        await self._broadcast_state(updated_state, source)
        await self._broadcast_adaptive_decision(decision)
        await self.connections.broadcast("hume.emotion", model_to_dict(signals))
        await self.connections.broadcast("emotion.update", model_to_dict(emotion_update))
        await self._broadcast_events(self._events_from_hume_signals(signals) + self.events.from_adaptive_decision(decision))
        await self._broadcast_logs(self._logs_from_hume_signals(signals))
        return updated_state

    async def _frontend_to_hume_evi(self, websocket: WebSocket, hume_socket: Any) -> None:
        while True:
            raw = await websocket.receive_text()
            data = self._parse_json(raw)
            if not data:
                await self._send_ws_envelope(websocket, "hume.evi.error", {"message": "Invalid JSON message"})
                continue

            event_type = data.get("type")
            payload = data.get("payload", data)
            if event_type in {"close", "hume.evi.close"}:
                await hume_socket.close()
                return
            if event_type in {"audio_input", "hume.audio_input"}:
                audio_data = payload.get("data") or payload.get("audio") or payload.get("audio_base64")
                if not audio_data:
                    await self._send_ws_envelope(websocket, "hume.evi.error", {"message": "Missing base64 audio data"})
                    continue
                await hume_socket.send(json.dumps({"type": "audio_input", "data": audio_data}))
            elif event_type == "session_settings":
                await hume_socket.send(json.dumps({"type": "session_settings", **payload}))
            elif event_type in {"user_input", "text_input"}:
                text = payload.get("text", "")
                if text:
                    response = await self.process_text_emotion(TextEmotionRequest(text=text, update_state=True))
                    await self._send_ws_envelope(websocket, "hume.text_emotion", model_to_dict(response))
                if payload.get("forward_to_evi"):
                    await hume_socket.send(json.dumps({"type": "user_input", "text": text}))
            else:
                await hume_socket.send(json.dumps(data))

    async def _hume_evi_to_frontend(self, websocket: WebSocket, hume_socket: Any) -> None:
        async for raw in hume_socket:
            data = self._parse_json(raw)
            if data is None:
                await self._send_ws_envelope(websocket, "hume.evi.raw", {"raw": raw})
                continue

            await self._send_ws_envelope(websocket, "hume.evi.raw", data)
            message_type = data.get("type")
            if message_type == "user_message":
                transcript = self._extract_hume_transcript(data)
                scores = self._extract_hume_scores(data)
                if scores:
                    signals = self.hume.signals_from_hume_scores(scores, source="hume-evi-prosody", transcript=transcript)
                    await self._apply_hume_signals(signals, "hume.evi")
                    await self._send_ws_envelope(websocket, "hume.emotion", model_to_dict(signals))
                if transcript:
                    await self._send_ws_envelope(
                        websocket,
                        "hume.transcription",
                        {"text": transcript, "interim": bool(data.get("interim", False)), "source": "hume-evi"},
                    )
            elif message_type == "assistant_message":
                await self._send_ws_envelope(
                    websocket,
                    "hume.assistant_message",
                    {"text": self._extract_hume_transcript(data), "source": "hume-evi"},
                )
            elif message_type == "audio_output":
                await self._send_ws_envelope(
                    websocket,
                    "hume.audio_output",
                    {"data": data.get("data"), "source": "hume-evi"},
                )
            elif message_type == "error":
                await self._send_ws_envelope(websocket, "hume.evi.error", data)

    async def _frontend_to_hume_tts(self, websocket: WebSocket, hume_socket: Any) -> None:
        while True:
            raw = await websocket.receive_text()
            data = self._parse_json(raw)
            if not data:
                await self._send_ws_envelope(websocket, "hume.tts.error", {"message": "Invalid JSON message"})
                continue

            event_type = data.get("type")
            payload = data.get("payload", data)
            if event_type in {"close", "hume.tts.close"}:
                await hume_socket.send(json.dumps({"close": True}))
                await hume_socket.close()
                return
            if event_type in {"flush", "hume.tts.flush"}:
                await hume_socket.send(json.dumps({"flush": True}))
                continue
            if event_type in {"text", "hume.tts.text"}:
                state = await self.cognition.get_state()
                message = {
                    "text": payload.get("text", ""),
                    "description": payload.get("description") or self.hume._tts_description_for_state(state),
                    "voice": {
                        "name": payload.get("voice_name") or settings.hume_tts_voice_name,
                        "provider": payload.get("voice_provider") or settings.hume_tts_voice_provider,
                    },
                }
                await hume_socket.send(json.dumps(message))
                if payload.get("flush", True):
                    await hume_socket.send(json.dumps({"flush": True}))
            else:
                await hume_socket.send(json.dumps(data))

    async def _hume_tts_to_frontend(self, websocket: WebSocket, hume_socket: Any) -> None:
        async for raw in hume_socket:
            data = self._parse_json(raw)
            if data is None:
                await self._send_ws_envelope(websocket, "hume.tts.raw", {"raw": raw})
                continue
            event_type = "hume.audio_output" if data.get("audio") else "hume.tts.raw"
            await self._send_ws_envelope(websocket, event_type, data)

    async def _simulated_hume_evi_session(self, websocket: WebSocket) -> None:
        while True:
            raw = await websocket.receive_text()
            data = self._parse_json(raw)
            if not data:
                await self._send_ws_envelope(websocket, "hume.evi.error", {"message": "Invalid JSON message"})
                continue
            event_type = data.get("type")
            payload = data.get("payload", data)
            if event_type in {"close", "hume.evi.close"}:
                return
            if event_type in {"text_input", "user_input", "hume.text.analyze"} and payload.get("text"):
                response = await self.process_text_emotion(TextEmotionRequest(text=payload["text"], update_state=True))
                await self._send_ws_envelope(websocket, "hume.transcription", {"text": payload["text"], "interim": False})
                await self._send_ws_envelope(websocket, "hume.emotion", model_to_dict(response.signals))
            elif event_type in {"audio_input", "hume.audio_input"}:
                state = await self.cognition.get_state()
                response = await self.hume.analyze_text(
                    TextEmotionRequest(text=f"simulated microphone frame in {state.emotion} state", update_state=False),
                    state,
                )
                await self._apply_hume_signals(response.signals, "hume.evi.simulated")
                await self._send_ws_envelope(websocket, "hume.emotion", model_to_dict(response.signals))

    async def _send_ws_envelope(self, websocket: WebSocket, event_type: str, payload: Dict[str, Any]) -> None:
        envelope = RealtimeEnvelope(type=event_type, payload=payload)
        await websocket.send_json(model_to_dict(envelope))

    async def _close_ws(self, websocket: WebSocket, code: int = 1000) -> None:
        with suppress(Exception):
            await websocket.close(code=code)

    def _safe_hume_error(self, exc: Exception) -> str:
        message = str(exc)
        if settings.hume_api_key:
            message = message.replace(settings.hume_api_key, "[redacted]")
        return message[:240] or "Hume websocket session ended unexpectedly"

    def _parse_json(self, raw: Any) -> Optional[Dict[str, Any]]:
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8", errors="ignore")
        if isinstance(raw, Mapping):
            return dict(raw)
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {"value": parsed}
        except Exception:
            return None

    def _extract_hume_transcript(self, data: Mapping[str, Any]) -> str:
        message = data.get("message")
        if isinstance(message, Mapping):
            content = message.get("content")
            if content is not None:
                return str(content)
        for key in ("content", "text", "transcript"):
            if data.get(key):
                return str(data[key])
        return ""

    def _extract_hume_scores(self, data: Mapping[str, Any]) -> Dict[str, float]:
        models = data.get("models")
        if not isinstance(models, Mapping):
            return {}
        for model_name in ("prosody", "language"):
            model = models.get(model_name)
            if isinstance(model, Mapping):
                scores = model.get("scores")
                if isinstance(scores, Mapping):
                    return {str(name): float(score) for name, score in scores.items() if isinstance(score, (int, float))}
        return {}

    def _events_from_hume_signals(self, signals: HumeEmotionSignals) -> List[SystemEvent]:
        events: List[SystemEvent] = []
        if signals.stress >= 0.72:
            events.append(
                SystemEvent(
                    event="hume_stress_signal_detected",
                    severity="high",
                    recommendation="activate_stress_mode",
                    confidence=signals.stress,
                    signals=model_to_dict(signals),
                )
            )
        if signals.hesitation >= 0.62:
            events.append(
                SystemEvent(
                    event="hume_hesitation_signal_detected",
                    severity="medium",
                    recommendation="offer_stepwise_guidance",
                    confidence=signals.hesitation,
                    signals=model_to_dict(signals),
                )
            )
        if signals.engagement <= 0.28:
            events.append(
                SystemEvent(
                    event="hume_engagement_drop_detected",
                    severity="medium",
                    recommendation="shorten_and_reconfirm",
                    confidence=1.0 - signals.engagement,
                    signals=model_to_dict(signals),
                )
            )
        return events

    def _logs_from_hume_signals(self, signals: HumeEmotionSignals) -> List[ReasoningLog]:
        logs = [
            ReasoningLog(
                message=(
                    "Hume emotional signal fused: "
                    f"stress {signals.stress:.2f}, confidence {signals.confidence:.2f}, "
                    f"hesitation {signals.hesitation:.2f}, engagement {signals.engagement:.2f}"
                ),
                category="hume",
                intensity="medium" if signals.stress > 0.65 or signals.hesitation > 0.6 else "low",
            )
        ]
        if signals.transcript:
            logs.append(
                ReasoningLog(
                    message="Realtime transcription aligned with emotional expression scores",
                    category="hume",
                    intensity="low",
                )
            )
        return logs
