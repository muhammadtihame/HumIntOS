from __future__ import annotations

import asyncio
import json
import time
from contextlib import suppress
from typing import Any, Dict, List

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
    ReasoningLog,
    SystemEvent,
    model_to_dict,
)
from backend.services.events import SystemEventEngine
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
        elif event_type == "demo.trigger":
            scenario = payload.get("scenario", "normalize")
            if scenario not in {"overload", "focus", "normalize"}:
                await self.connections.send(websocket, "system.error", {"message": f"Unknown demo scenario: {scenario}"})
                return
            response = await self.trigger_demo(scenario)
            await self.connections.send(websocket, "demo.ack", model_to_dict(response))
        else:
            await self.connections.send(websocket, "system.ack", {"received": event_type or "unknown"})

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
