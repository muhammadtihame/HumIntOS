from __future__ import annotations

import asyncio
import random
import time
from typing import Dict, Iterable, List, Mapping, Optional

from backend.models.schemas import CognitiveState, ReasoningLog, SystemEvent, utc_now_iso
from backend.utils.math import clamp, jitter, lerp, weighted_choice


COGNITIVE_KEYS = (
    "stress_level",
    "focus_level",
    "cognitive_load",
    "fatigue",
    "intent_confidence",
    "distraction_probability",
    "behavioral_consistency",
)


class CognitiveStateEngine:
    """Owns the live HumIntOS cognitive model.

    The MVP is intentionally heuristic, but not chaotic: every value has a
    target, inertia, ambient drift, and event-driven nudges.
    """

    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._values: Dict[str, float] = {
            "stress_level": 42.0,
            "focus_level": 67.0,
            "cognitive_load": 48.0,
            "fatigue": 31.0,
            "intent_confidence": 78.0,
            "distraction_probability": 26.0,
            "behavioral_consistency": 72.0,
        }
        self._targets: Dict[str, float] = dict(self._values)
        self._anchors: Dict[str, float] = {
            "stress_level": 38.0,
            "focus_level": 70.0,
            "cognitive_load": 46.0,
            "fatigue": 35.0,
            "intent_confidence": 80.0,
            "distraction_probability": 24.0,
            "behavioral_consistency": 74.0,
        }
        self._emotion = "focused"
        self._active_mode = "normal_mode"
        self._assistant_style = "balanced_collaborative"
        self._last_tick = time.monotonic()
        self._last_target_shift = time.monotonic()

    async def get_state(self) -> CognitiveState:
        async with self._lock:
            return self._snapshot_unlocked()

    async def tick(self) -> CognitiveState:
        async with self._lock:
            now = time.monotonic()
            dt = max(0.1, min(2.5, now - self._last_tick))
            self._last_tick = now

            if now - self._last_target_shift > random.uniform(3.5, 6.5):
                self._ambient_target_shift_unlocked()
                self._last_target_shift = now

            # Cross-coupled physiology: stress/load pull focus down; focus and
            # consistency pull confidence up. These small rules create a living
            # system without a real ML model.
            self._targets["focus_level"] += (50.0 - self._targets["stress_level"]) * 0.015
            self._targets["cognitive_load"] += (self._targets["stress_level"] - 45.0) * 0.012
            self._targets["distraction_probability"] += (60.0 - self._targets["focus_level"]) * 0.018
            self._targets["intent_confidence"] += (self._targets["focus_level"] - 55.0) * 0.012
            self._targets["behavioral_consistency"] += (55.0 - self._targets["distraction_probability"]) * 0.01
            self._targets["fatigue"] += 0.04 * dt

            for key in COGNITIVE_KEYS:
                target_pull = (self._anchors[key] - self._targets[key]) * 0.012 * dt
                self._targets[key] = clamp(self._targets[key] + target_pull)
                smoothing = 0.13 if key in {"stress_level", "focus_level", "cognitive_load"} else 0.09
                noise = jitter(0.22 if key != "fatigue" else 0.08)
                self._values[key] = clamp(lerp(self._values[key], self._targets[key], smoothing * dt) + noise)

            self._emotion = self._derive_emotion_unlocked()
            return self._snapshot_unlocked()

    async def set_adaptive_mode(self, mode: str, assistant_style: str) -> CognitiveState:
        async with self._lock:
            self._active_mode = mode
            self._assistant_style = assistant_style
            return self._snapshot_unlocked()

    async def apply_emotion_analysis(self, emotion: str, attention_score: float, fatigue_level: float, stress_probability: float) -> CognitiveState:
        async with self._lock:
            attention = clamp(attention_score * 100.0)
            fatigue = clamp(fatigue_level * 100.0)
            stress = clamp(stress_probability * 100.0)

            self._targets["focus_level"] = lerp(self._targets["focus_level"], attention, 0.42)
            self._targets["fatigue"] = lerp(self._targets["fatigue"], fatigue, 0.35)
            self._targets["stress_level"] = lerp(self._targets["stress_level"], stress, 0.38)
            self._targets["cognitive_load"] += (stress - 50.0) * 0.16
            self._targets["distraction_probability"] += (50.0 - attention) * 0.16

            if emotion in {"angry", "fear", "sad", "stressed"}:
                self._targets["stress_level"] += 8.0
                self._targets["intent_confidence"] -= 4.0
            elif emotion in {"happy", "calm", "focused"}:
                self._targets["stress_level"] -= 6.0
                self._targets["focus_level"] += 5.0
                self._targets["intent_confidence"] += 3.0

            self._normalize_targets_unlocked()
            self._emotion = emotion
            return self._snapshot_unlocked()

    async def apply_behavior_deltas(self, deltas: Mapping[str, float]) -> CognitiveState:
        async with self._lock:
            for key, delta in deltas.items():
                if key in self._targets:
                    self._targets[key] = clamp(self._targets[key] + delta)
            self._normalize_targets_unlocked()
            return self._snapshot_unlocked()

    async def force_state(self, updates: Mapping[str, float], emotion: Optional[str] = None) -> CognitiveState:
        async with self._lock:
            for key, value in updates.items():
                if key in self._values:
                    self._values[key] = clamp(value)
                    self._targets[key] = clamp(value)
            if emotion:
                self._emotion = emotion
            return self._snapshot_unlocked()

    def build_state_events(self, state: CognitiveState) -> List[SystemEvent]:
        events: List[SystemEvent] = []
        if state.stress_level >= 82:
            events.append(
                SystemEvent(
                    event="stress_spike_detected",
                    severity="high",
                    recommendation="activate_stress_mode",
                    confidence=0.87,
                    signals={"stress_level": state.stress_level},
                )
            )
        if state.focus_level <= 35:
            events.append(
                SystemEvent(
                    event="focus_drop_detected",
                    severity="high",
                    recommendation="activate_focus_recovery",
                    confidence=0.82,
                    signals={"focus_level": state.focus_level},
                )
            )
        if state.cognitive_load >= 86:
            events.append(
                SystemEvent(
                    event="cognitive_overload_detected",
                    severity="critical",
                    recommendation="activate_overload_mode",
                    confidence=0.9,
                    signals={"cognitive_load": state.cognitive_load},
                )
            )
        if state.distraction_probability >= 72:
            events.append(
                SystemEvent(
                    event="attention_instability_increasing",
                    severity="medium",
                    recommendation="reduce_visual_noise",
                    confidence=0.78,
                    signals={"distraction_probability": state.distraction_probability},
                )
            )
        return events

    def build_reasoning_logs(self, state: CognitiveState) -> List[ReasoningLog]:
        logs: List[ReasoningLog] = []
        if state.cognitive_load > 78:
            logs.append(
                ReasoningLog(
                    message="Detected elevated cognitive load; reducing informational density",
                    category="cognitive",
                    intensity="high" if state.cognitive_load > 88 else "medium",
                )
            )
        if state.stress_level > 72:
            logs.append(
                ReasoningLog(
                    message="Stress probability rising; switching assistant communication toward guided support",
                    category="emotion",
                    intensity="high" if state.stress_level > 84 else "medium",
                )
            )
        if state.focus_level > 82:
            logs.append(
                ReasoningLog(
                    message="Sustained focus detected; prioritizing concise technical responses",
                    category="attention",
                    intensity="low",
                )
            )
        if state.distraction_probability > 65:
            logs.append(
                ReasoningLog(
                    message="Attention instability increasing; adaptive focus protocol queued",
                    category="behavior",
                    intensity="medium",
                )
            )
        if not logs:
            logs.append(
                ReasoningLog(
                    message=weighted_choice(
                        (
                            ("Monitoring intent confidence and interaction rhythm", 0.35),
                            ("Cognitive baseline stable; maintaining normal adaptive mode", 0.35),
                            ("Behavioral signal stream synchronized", 0.3),
                        )
                    ),
                    category="system",
                    intensity="low",
                )
            )
        return logs

    def _ambient_target_shift_unlocked(self) -> None:
        self._targets["stress_level"] += jitter(3.0)
        self._targets["focus_level"] += jitter(4.0)
        self._targets["cognitive_load"] += jitter(3.2)
        self._targets["fatigue"] += random.uniform(-0.4, 1.5)
        self._targets["intent_confidence"] += jitter(2.0)
        self._targets["distraction_probability"] += jitter(3.0)
        self._targets["behavioral_consistency"] += jitter(2.0)
        self._normalize_targets_unlocked()

    def _normalize_targets_unlocked(self) -> None:
        for key in COGNITIVE_KEYS:
            self._targets[key] = clamp(self._targets[key])

    def _derive_emotion_unlocked(self) -> str:
        stress = self._values["stress_level"]
        focus = self._values["focus_level"]
        load = self._values["cognitive_load"]
        fatigue = self._values["fatigue"]
        distraction = self._values["distraction_probability"]

        options = [
            ("focused", max(0.0, focus - stress * 0.35 - fatigue * 0.15)),
            ("stressed", max(0.0, stress + load * 0.25 - focus * 0.25)),
            ("overloaded", max(0.0, load + stress * 0.25 - focus * 0.2 - 38.0)),
            ("fatigued", max(0.0, fatigue + load * 0.12 - focus * 0.1 - 22.0)),
            ("distracted", max(0.0, distraction + 45.0 - focus)),
            ("calm", max(0.0, 88.0 - stress - load * 0.22 + focus * 0.18)),
        ]
        return weighted_choice(options)

    def _snapshot_unlocked(self) -> CognitiveState:
        values = {key: int(round(clamp(value))) for key, value in self._values.items()}
        return CognitiveState(
            stress_level=values["stress_level"],
            focus_level=values["focus_level"],
            cognitive_load=values["cognitive_load"],
            emotion=self._emotion,
            fatigue=values["fatigue"],
            intent_confidence=values["intent_confidence"],
            distraction_probability=values["distraction_probability"],
            behavioral_consistency=values["behavioral_consistency"],
            active_mode=self._active_mode,  # type: ignore[arg-type]
            assistant_style=self._assistant_style,
            last_updated=utc_now_iso(),
        )

