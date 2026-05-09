from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


AdaptiveMode = Literal[
    "normal_mode",
    "focus_mode",
    "stress_mode",
    "cognitive_overload_mode",
]

Severity = Literal["low", "medium", "high", "critical"]


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def model_to_dict(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()  # type: ignore[attr-defined]
    return model.dict()


class CognitiveState(BaseModel):
    stress_level: int = Field(ge=0, le=100)
    focus_level: int = Field(ge=0, le=100)
    cognitive_load: int = Field(ge=0, le=100)
    emotion: str
    fatigue: int = Field(ge=0, le=100)
    intent_confidence: int = Field(ge=0, le=100)
    distraction_probability: int = Field(ge=0, le=100)
    behavioral_consistency: int = Field(ge=0, le=100)
    empathy_level: int = Field(default=50, ge=0, le=100)
    hesitation_level: int = Field(default=20, ge=0, le=100)
    engagement_level: int = Field(default=65, ge=0, le=100)
    voice_confidence: int = Field(default=70, ge=0, le=100)
    active_mode: AdaptiveMode = "normal_mode"
    assistant_style: str = "balanced_collaborative"
    last_updated: str = Field(default_factory=utc_now_iso)


class EmotionAnalyzeRequest(BaseModel):
    image_base64: Optional[str] = Field(default=None, max_length=3_000_000)
    simulate: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EmotionAnalysisResponse(BaseModel):
    emotion: str
    confidence: float = Field(ge=0.0, le=1.0)
    attention_score: float = Field(ge=0.0, le=1.0)
    fatigue_level: float = Field(ge=0.0, le=1.0)
    stress_probability: float = Field(ge=0.0, le=1.0)
    face_detected: bool = False
    landmarks_detected: bool = False
    source: str = "simulated"
    eye_openness: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    mouth_open: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    brow_lift: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    mouth_curve: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    gaze_x: Optional[float] = Field(default=None, ge=-1.0, le=1.0)
    gaze_y: Optional[float] = Field(default=None, ge=-1.0, le=1.0)
    face_confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    timestamp: str = Field(default_factory=utc_now_iso)


class HumeEmotionSignals(BaseModel):
    stress: float = Field(default=0.0, ge=0.0, le=1.0)
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    empathy: float = Field(default=0.0, ge=0.0, le=1.0)
    hesitation: float = Field(default=0.0, ge=0.0, le=1.0)
    engagement: float = Field(default=0.0, ge=0.0, le=1.0)
    dominant_emotion: str = "neutral"
    top_emotions: Dict[str, float] = Field(default_factory=dict)
    transcript: Optional[str] = None
    source: str = "hume"


class TextEmotionRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)
    update_state: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TextEmotionResponse(BaseModel):
    text: str
    provider: str
    signals: HumeEmotionSignals
    raw: Dict[str, Any] = Field(default_factory=dict)
    state: Optional[CognitiveState] = None
    latency_ms: int = 0
    timestamp: str = Field(default_factory=utc_now_iso)


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=5_000)
    voice_name: Optional[str] = None
    voice_provider: Optional[str] = None
    description: Optional[str] = Field(default=None, max_length=1_000)
    strip_headers: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


class TTSResponse(BaseModel):
    provider: str
    configured: bool
    voice_name: Optional[str] = None
    voice_provider: Optional[str] = None
    mime_type: str = "audio/wav"
    audio_chunks: List[str] = Field(default_factory=list)
    generation_ids: List[str] = Field(default_factory=list)
    description: str
    fallback_text: Optional[str] = None
    error: Optional[str] = None
    latency_ms: int = 0
    timestamp: str = Field(default_factory=utc_now_iso)


class HumeStatusResponse(BaseModel):
    configured: bool
    api_key_present: bool
    evi_configured: bool
    evi_config_id_present: bool
    tts_voice_name: Optional[str] = None
    expression_api_note: str
    endpoints: Dict[str, str]


class BehaviorTelemetry(BaseModel):
    typing_speed: float = Field(default=0.0, ge=0.0, description="Characters per minute")
    mouse_movement: float = Field(default=0.0, ge=0.0, description="Pixels moved in the sampling window")
    mouse_velocity: float = Field(default=0.0, ge=0.0, description="Alias-friendly pointer velocity signal")
    click_frequency: float = Field(default=0.0, ge=0.0, description="Clicks per minute")
    inactivity_seconds: float = Field(default=0.0, ge=0.0)
    tab_switches: int = Field(default=0, ge=0)
    hesitation_ms: float = Field(default=0.0, ge=0.0)
    window_focus_changes: int = Field(default=0, ge=0)
    correction_rate: float = Field(default=0.0, ge=0.0, description="Backspaces/edits per minute")
    gaze_x: Optional[float] = Field(default=None, description="Backend face-mesh horizontal offset from frame center")
    gaze_y: Optional[float] = Field(default=None, description="Backend face-mesh vertical offset from frame center")
    gaze_deviation: float = Field(default=0.0, ge=0.0, le=1.0, description="Normalized gaze drift from the task area")
    eye_tracking_confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SystemEvent(BaseModel):
    event: str
    severity: Severity = "low"
    recommendation: Optional[str] = None
    confidence: float = Field(default=0.75, ge=0.0, le=1.0)
    signals: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=utc_now_iso)


class BehaviorUpdateResponse(BaseModel):
    accepted: bool = True
    overload_score: int = Field(ge=0, le=100)
    hesitation_score: int = Field(ge=0, le=100)
    distraction_score: int = Field(ge=0, le=100)
    instability_score: int = Field(ge=0, le=100)
    focus_loss_score: int = Field(ge=0, le=100)
    events: List[SystemEvent] = Field(default_factory=list)
    state: CognitiveState


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1)
    context: Dict[str, Any] = Field(default_factory=dict)
    stream: bool = False


class AssistantResponse(BaseModel):
    response: str
    mode: AdaptiveMode
    style: str
    model: str
    latency_ms: int
    state_context: Dict[str, Any]
    timestamp: str = Field(default_factory=utc_now_iso)


class AdaptiveDecision(BaseModel):
    mode: AdaptiveMode
    assistant_style: str
    changed: bool = False
    reason: str
    priority: int = 0
    signals: Dict[str, Any] = Field(default_factory=dict)
    timestamp: str = Field(default_factory=utc_now_iso)


class ReasoningLog(BaseModel):
    message: str
    category: str = "system"
    intensity: Severity = "low"
    timestamp: str = Field(default_factory=utc_now_iso)


class DemoResponse(BaseModel):
    scenario: str
    activated: bool = True
    state: CognitiveState
    events: List[SystemEvent]
    logs: List[ReasoningLog]


class RealtimeEnvelope(BaseModel):
    type: str
    payload: Dict[str, Any]
    timestamp: str = Field(default_factory=utc_now_iso)
