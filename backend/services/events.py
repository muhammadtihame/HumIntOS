from __future__ import annotations

import time
from typing import Dict, Iterable, List

from backend.models.schemas import AdaptiveDecision, CognitiveState, SystemEvent


class SystemEventEngine:
    def __init__(self) -> None:
        self._last_emit: Dict[str, float] = {}
        self._cooldown_seconds = 6.0

    def from_adaptive_decision(self, decision: AdaptiveDecision) -> List[SystemEvent]:
        if not decision.changed:
            return []
        return [
            SystemEvent(
                event="adaptive_mode_changed",
                severity="medium" if decision.mode != "cognitive_overload_mode" else "high",
                recommendation=decision.mode,
                confidence=0.91,
                signals={**decision.signals, "reason": decision.reason, "assistant_style": decision.assistant_style},
            )
        ]

    def filter_cooldown(self, events: Iterable[SystemEvent]) -> List[SystemEvent]:
        now = time.monotonic()
        accepted: List[SystemEvent] = []
        for event in events:
            key = event.event
            if now - self._last_emit.get(key, 0.0) >= self._cooldown_seconds:
                self._last_emit[key] = now
                accepted.append(event)
        return accepted

