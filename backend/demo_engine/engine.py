from __future__ import annotations

from typing import Dict, List, Tuple

from backend.models.schemas import ReasoningLog, SystemEvent


class DemoModeEngine:
    def scenario(self, name: str) -> Tuple[Dict[str, float], str, List[SystemEvent], List[ReasoningLog]]:
        scenarios = {
            "overload": (
                {
                    "stress_level": 89,
                    "focus_level": 28,
                    "cognitive_load": 94,
                    "fatigue": 68,
                    "intent_confidence": 46,
                    "distraction_probability": 78,
                    "behavioral_consistency": 34,
                },
                "overloaded",
                [
                    SystemEvent(
                        event="demo_cognitive_overload_injected",
                        severity="critical",
                        recommendation="activate_overload_mode",
                        confidence=0.99,
                    ),
                    SystemEvent(
                        event="interface_simplification_required",
                        severity="high",
                        recommendation="reduce_information_density",
                        confidence=0.94,
                    ),
                ],
                [
                    ReasoningLog(message="Detected elevated cognitive load", category="demo", intensity="high"),
                    ReasoningLog(message="Switching assistant communication mode to simplified guidance", category="assistant", intensity="high"),
                    ReasoningLog(message="Reducing informational density for overload recovery", category="adaptive", intensity="critical"),
                ],
            ),
            "focus": (
                {
                    "stress_level": 24,
                    "focus_level": 93,
                    "cognitive_load": 41,
                    "fatigue": 22,
                    "intent_confidence": 92,
                    "distraction_probability": 12,
                    "behavioral_consistency": 88,
                },
                "focused",
                [
                    SystemEvent(
                        event="demo_deep_focus_injected",
                        severity="low",
                        recommendation="activate_focus_mode",
                        confidence=0.97,
                    )
                ],
                [
                    ReasoningLog(message="Sustained focus detected", category="demo", intensity="low"),
                    ReasoningLog(message="Adaptive focus protocol activated", category="adaptive", intensity="medium"),
                    ReasoningLog(message="Assistant response style compressed for technical flow", category="assistant", intensity="low"),
                ],
            ),
            "normalize": (
                {
                    "stress_level": 38,
                    "focus_level": 70,
                    "cognitive_load": 46,
                    "fatigue": 34,
                    "intent_confidence": 80,
                    "distraction_probability": 24,
                    "behavioral_consistency": 74,
                },
                "calm",
                [
                    SystemEvent(
                        event="demo_baseline_restored",
                        severity="low",
                        recommendation="activate_normal_mode",
                        confidence=0.96,
                    )
                ],
                [
                    ReasoningLog(message="Cognitive baseline restored", category="demo", intensity="low"),
                    ReasoningLog(message="Normal adaptive mode synchronized", category="adaptive", intensity="low"),
                ],
            ),
        }
        return scenarios[name]

