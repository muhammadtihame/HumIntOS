from __future__ import annotations

import asyncio
import random
import time
from typing import Dict, Iterable, List, Mapping, Optional

from backend.models.schemas import CognitiveState, HumeEmotionSignals, ReasoningLog, SystemEvent, utc_now_iso
from backend.utils.math import clamp, jitter, lerp, weighted_choice


COGNITIVE_KEYS = (
    "stress_level",
    "focus_level",
    "cognitive_load",
    "fatigue",
    "intent_confidence",
    "distraction_probability",
    "behavioral_consistency",
    "empathy_level",
    "hesitation_level",
    "engagement_level",
    "voice_confidence",
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
            "empathy_level": 50.0,
            "hesitation_level": 20.0,
            "engagement_level": 65.0,
            "voice_confidence": 70.0,
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
            "empathy_level": 52.0,
            "hesitation_level": 18.0,
            "engagement_level": 66.0,
            "voice_confidence": 72.0,
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
            self._targets["focus_level"] += (self._targets["engagement_level"] - 60.0) * 0.012
            self._targets["cognitive_load"] += self._targets["hesitation_level"] * 0.004
            self._targets["intent_confidence"] += (self._targets["voice_confidence"] - 60.0) * 0.008
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

    async def apply_hume_signals(self, signals: HumeEmotionSignals) -> CognitiveState:
        async with self._lock:
            stress = clamp(signals.stress * 100.0)
            confidence = clamp(signals.confidence * 100.0)
            empathy = clamp(signals.empathy * 100.0)
            hesitation = clamp(signals.hesitation * 100.0)
            engagement = clamp(signals.engagement * 100.0)

            inferred_focus = clamp(engagement * 0.66 + confidence * 0.26 + (100.0 - hesitation) * 0.08 - stress * 0.14)
            inferred_load = clamp(stress * 0.48 + hesitation * 0.28 + (100.0 - confidence) * 0.16 + self._targets["cognitive_load"] * 0.08)

            self._targets["stress_level"] = lerp(self._targets["stress_level"], stress, 0.5)
            self._targets["focus_level"] = lerp(self._targets["focus_level"], inferred_focus, 0.42)
            self._targets["cognitive_load"] = lerp(self._targets["cognitive_load"], inferred_load, 0.44)
            self._targets["intent_confidence"] = lerp(self._targets["intent_confidence"], confidence, 0.5)
            self._targets["distraction_probability"] = lerp(
                self._targets["distraction_probability"],
                clamp(hesitation * 0.52 + (100.0 - engagement) * 0.48),
                0.38,
            )
            self._targets["behavioral_consistency"] = lerp(
                self._targets["behavioral_consistency"],
                clamp(confidence * 0.54 + engagement * 0.32 + (100.0 - hesitation) * 0.14),
                0.36,
            )
            self._targets["empathy_level"] = lerp(self._targets["empathy_level"], empathy, 0.52)
            self._targets["hesitation_level"] = lerp(self._targets["hesitation_level"], hesitation, 0.58)
            self._targets["engagement_level"] = lerp(self._targets["engagement_level"], engagement, 0.52)
            self._targets["voice_confidence"] = lerp(self._targets["voice_confidence"], confidence, 0.5)

            if signals.dominant_emotion and signals.dominant_emotion != "neutral":
                self._emotion = signals.dominant_emotion.lower().replace(" ", "_")
            self._normalize_targets_unlocked()

            for key in COGNITIVE_KEYS:
                self._values[key] = lerp(self._values[key], self._targets[key], 0.45)
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
        if state.hesitation_level >= 72:
            events.append(
                SystemEvent(
                    event="emotional_hesitation_detected",
                    severity="medium" if state.hesitation_level < 86 else "high",
                    recommendation="offer_guided_next_step",
                    confidence=0.84,
                    signals={"hesitation_level": state.hesitation_level},
                )
            )
        if state.engagement_level <= 34:
            events.append(
                SystemEvent(
                    event="engagement_drop_detected",
                    severity="medium",
                    recommendation="shorten_response_and_reconfirm_intent",
                    confidence=0.79,
                    signals={"engagement_level": state.engagement_level},
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
        if state.hesitation_level > 62:
            logs.append(
                ReasoningLog(
                    message="Voice/text hesitation signal elevated; preparing guided next-step assistance",
                    category="hume",
                    intensity="medium",
                )
            )
        if state.engagement_level > 78:
            logs.append(
                ReasoningLog(
                    message="Engagement signal strong; preserving momentum with low-latency response pacing",
                    category="hume",
                    intensity="low",
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
        self._targets["empathy_level"] += jitter(1.4)
        self._targets["hesitation_level"] += jitter(1.7)
        self._targets["engagement_level"] += jitter(2.3)
        self._targets["voice_confidence"] += jitter(1.8)
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
        engagement = self._values["engagement_level"]
        hesitation = self._values["hesitation_level"]

        options = [
            ("focused", max(0.0, focus + engagement * 0.18 - stress * 0.35 - fatigue * 0.15)),
            ("stressed", max(0.0, stress + load * 0.25 - focus * 0.25)),
            ("overloaded", max(0.0, load + stress * 0.25 - focus * 0.2 - 38.0)),
            ("fatigued", max(0.0, fatigue + load * 0.12 - focus * 0.1 - 22.0)),
            ("distracted", max(0.0, distraction + 45.0 - focus)),
            ("hesitant", max(0.0, hesitation + stress * 0.18 - engagement * 0.12 - 20.0)),
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
            empathy_level=values["empathy_level"],
            hesitation_level=values["hesitation_level"],
            engagement_level=values["engagement_level"],
            voice_confidence=values["voice_confidence"],
            active_mode=self._active_mode,  # type: ignore[arg-type]
            assistant_style=self._assistant_style,
            last_updated=utc_now_iso(),
        )
