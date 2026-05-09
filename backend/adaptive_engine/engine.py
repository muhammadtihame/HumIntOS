from __future__ import annotations

from backend.models.schemas import AdaptiveDecision, CognitiveState


class AdaptiveModeEngine:
    def __init__(self) -> None:
        self._last_mode = "normal_mode"

    def evaluate(self, state: CognitiveState) -> AdaptiveDecision:
        if state.cognitive_load >= 85 or (state.stress_level >= 80 and state.focus_level <= 45) or state.hesitation_level >= 88:
            mode = "cognitive_overload_mode"
            style = "simplified_guided"
            reason = "Cognitive load threshold exceeded"
            priority = 4
        elif state.stress_level >= 75 or (state.hesitation_level >= 70 and state.voice_confidence <= 45):
            mode = "stress_mode"
            style = "calming_stepwise"
            reason = "Stress or hesitation threshold exceeded"
            priority = 3
        elif state.focus_level >= 80 and state.stress_level <= 62 and state.distraction_probability <= 45 and state.engagement_level >= 64:
            mode = "focus_mode"
            style = "concise_technical"
            reason = "Sustained focus and low distraction detected"
            priority = 2
        else:
            mode = "normal_mode"
            style = "balanced_collaborative"
            reason = "Cognitive signals within adaptive baseline"
            priority = 1

        changed = mode != self._last_mode
        self._last_mode = mode
        return AdaptiveDecision(
            mode=mode,  # type: ignore[arg-type]
            assistant_style=style,
            changed=changed,
            reason=reason,
            priority=priority,
            signals={
                "stress_level": state.stress_level,
                "focus_level": state.focus_level,
                "cognitive_load": state.cognitive_load,
                "distraction_probability": state.distraction_probability,
                "hesitation_level": state.hesitation_level,
                "engagement_level": state.engagement_level,
                "voice_confidence": state.voice_confidence,
            },
        )
