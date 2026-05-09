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
                    "empathy_level": 43,
                    "hesitation_level": 88,
                    "engagement_level": 31,
                    "voice_confidence": 34,
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
                    "empathy_level": 58,
                    "hesitation_level": 9,
                    "engagement_level": 93,
                    "voice_confidence": 91,
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
            "stress": (
                {
                    "stress_level": 78,
                    "focus_level": 52,
                    "cognitive_load": 68,
                    "fatigue": 48,
                    "intent_confidence": 58,
                    "distraction_probability": 50,
                    "behavioral_consistency": 52,
                    "empathy_level": 62,
                    "hesitation_level": 74,
                    "engagement_level": 49,
                    "voice_confidence": 44,
                },
                "stressed",
                [
                    SystemEvent(
                        event="demo_stress_mode_injected",
                        severity="high",
                        recommendation="activate_stress_mode",
                        confidence=0.97,
                    ),
                    SystemEvent(
                        event="guided_response_required",
                        severity="medium",
                        recommendation="offer_stepwise_guidance",
                        confidence=0.9,
                    ),
                ],
                [
                    ReasoningLog(message="Elevated stress marker injected", category="demo", intensity="high"),
                    ReasoningLog(message="Assistant response style moved to calming stepwise mode", category="assistant", intensity="medium"),
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
                    "empathy_level": 52,
                    "hesitation_level": 18,
                    "engagement_level": 66,
                    "voice_confidence": 72,
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
