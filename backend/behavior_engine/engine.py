from __future__ import annotations

from typing import Dict, List, Tuple

from backend.models.schemas import BehaviorTelemetry, SystemEvent
from backend.utils.math import clamp


class BehaviorAnalyticsEngine:
    def analyze(self, telemetry: BehaviorTelemetry) -> Tuple[Dict[str, int], Dict[str, float], List[SystemEvent]]:
        overload_score = self._score_overload(telemetry)
        hesitation_score = self._score_hesitation(telemetry)
        distraction_score = self._score_distraction(telemetry)
        instability_score = self._score_instability(telemetry)
        gaze_pressure = clamp(telemetry.gaze_deviation * 100.0)
        focus_loss_score = int(
            round(
                clamp(
                    (distraction_score * 0.45)
                    + (hesitation_score * 0.25)
                    + (telemetry.inactivity_seconds * 1.2)
                    + (gaze_pressure * 0.16)
                )
            )
        )

        scores = {
            "overload_score": overload_score,
            "hesitation_score": hesitation_score,
            "distraction_score": distraction_score,
            "instability_score": instability_score,
            "focus_loss_score": focus_loss_score,
        }

        deltas = {
            "stress_level": overload_score * 0.055 + instability_score * 0.035,
            "focus_level": -(focus_loss_score * 0.075 + distraction_score * 0.045),
            "cognitive_load": overload_score * 0.08 + hesitation_score * 0.035,
            "distraction_probability": distraction_score * 0.1 + telemetry.tab_switches * 0.8,
            "behavioral_consistency": -(instability_score * 0.07 + correction_rate_to_delta(telemetry.correction_rate)),
            "intent_confidence": -(hesitation_score * 0.04 + focus_loss_score * 0.035),
            "engagement_level": -(gaze_pressure * 0.025),
        }

        events: List[SystemEvent] = []
        if hesitation_score >= 55:
            events.append(
                SystemEvent(
                    event="high_hesitation_detected",
                    severity="medium" if hesitation_score < 78 else "high",
                    recommendation="offer_stepwise_guidance",
                    confidence=0.82,
                    signals={"hesitation_ms": telemetry.hesitation_ms, "hesitation_score": hesitation_score},
                )
            )
        if distraction_score >= 45:
            events.append(
                SystemEvent(
                    event="distraction_pattern_detected",
                    severity="medium" if distraction_score < 74 else "high",
                    recommendation="activate_focus_mode",
                    confidence=0.8,
                    signals={"tab_switches": telemetry.tab_switches, "inactivity_seconds": telemetry.inactivity_seconds},
                )
            )
        if overload_score >= 60:
            events.append(
                SystemEvent(
                    event="behavioral_overload_detected",
                    severity="high",
                    recommendation="activate_overload_mode",
                    confidence=0.84,
                    signals={"typing_speed": telemetry.typing_speed, "correction_rate": telemetry.correction_rate},
                )
            )
        if instability_score >= 55:
            events.append(
                SystemEvent(
                    event="interaction_instability_detected",
                    severity="medium",
                    recommendation="reduce_interface_motion",
                    confidence=0.76,
                    signals={"mouse_movement": telemetry.mouse_movement, "click_frequency": telemetry.click_frequency},
                )
            )
        if telemetry.gaze_deviation >= 0.72:
            events.append(
                SystemEvent(
                    event="gaze_drift_detected",
                    severity="medium" if telemetry.gaze_deviation < 0.9 else "high",
                    recommendation="activate_focus_mode",
                    confidence=max(0.55, telemetry.eye_tracking_confidence),
                    signals={
                        "gaze_x": telemetry.gaze_x,
                        "gaze_y": telemetry.gaze_y,
                        "gaze_deviation": telemetry.gaze_deviation,
                        "eye_tracking_confidence": telemetry.eye_tracking_confidence,
                    },
                )
            )

        return scores, deltas, events

    def _score_overload(self, telemetry: BehaviorTelemetry) -> int:
        rapid_typing = clamp((telemetry.typing_speed - 180.0) / 1.7)
        correction_pressure = clamp(telemetry.correction_rate * 3.4)
        click_pressure = clamp((telemetry.click_frequency - 18.0) * 2.2)
        hesitation_pressure = clamp(telemetry.hesitation_ms / 38.0)
        return int(round(clamp(rapid_typing * 0.25 + correction_pressure * 0.3 + click_pressure * 0.2 + hesitation_pressure * 0.25)))

    def _score_hesitation(self, telemetry: BehaviorTelemetry) -> int:
        pause = clamp(telemetry.hesitation_ms / 18.0)
        slow_typing = clamp(70.0 - telemetry.typing_speed)
        inactivity = clamp(telemetry.inactivity_seconds * 2.3)
        return int(round(clamp(pause * 0.55 + slow_typing * 0.25 + inactivity * 0.2)))

    def _score_distraction(self, telemetry: BehaviorTelemetry) -> int:
        tab_switch = clamp(telemetry.tab_switches * 18.0)
        focus_changes = clamp(telemetry.window_focus_changes * 14.0)
        inactivity = clamp(telemetry.inactivity_seconds * 2.0)
        low_activity = clamp(42.0 - telemetry.typing_speed) if telemetry.inactivity_seconds > 4 else 0.0
        gaze_drift = clamp(telemetry.gaze_deviation * 100.0)
        tracking_loss = clamp((0.5 - telemetry.eye_tracking_confidence) * 100.0) if telemetry.eye_tracking_confidence > 0 else 0.0
        return int(
            round(
                clamp(
                    tab_switch * 0.3
                    + focus_changes * 0.25
                    + inactivity * 0.16
                    + low_activity * 0.09
                    + gaze_drift * 0.16
                    + tracking_loss * 0.04
                )
            )
        )

    def _score_instability(self, telemetry: BehaviorTelemetry) -> int:
        pointer_motion = max(telemetry.mouse_movement, telemetry.mouse_velocity)
        mouse = clamp(pointer_motion / 24.0)
        clicks = clamp((telemetry.click_frequency - 12.0) * 2.5)
        correction = clamp(telemetry.correction_rate * 2.3)
        return int(round(clamp(mouse * 0.34 + clicks * 0.36 + correction * 0.3)))


def correction_rate_to_delta(correction_rate: float) -> float:
    return clamp(correction_rate * 0.12, 0.0, 8.0)
