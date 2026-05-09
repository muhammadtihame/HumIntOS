from __future__ import annotations

from fastapi import APIRouter

from backend.models.schemas import (
    AssistantRequest,
    AssistantResponse,
    BehaviorTelemetry,
    BehaviorUpdateResponse,
    CognitiveState,
    DemoResponse,
    EmotionAnalysisResponse,
    EmotionAnalyzeRequest,
    HumeStatusResponse,
    TextEmotionRequest,
    TextEmotionResponse,
    TTSRequest,
    TTSResponse,
    model_to_dict,
)
from backend.services.runtime import orchestrator
from backend.utils.config import settings


router = APIRouter()


@router.get("/health")
async def health() -> dict:
    state = await orchestrator.current_state()
    return {
        "status": "ok",
        "system": settings.app_name,
        "environment": settings.environment,
        "uptime_seconds": orchestrator.uptime_seconds,
        "active_connections": orchestrator.connections.active_count,
        "active_mode": state.active_mode,
        "hume_configured": orchestrator.hume.configured,
    }


@router.get("/state/current", response_model=CognitiveState)
async def current_state() -> CognitiveState:
    return await orchestrator.current_state()


@router.post("/emotion/analyze", response_model=EmotionAnalysisResponse)
async def analyze_emotion(request: EmotionAnalyzeRequest) -> EmotionAnalysisResponse:
    return await orchestrator.process_emotion(request)


@router.post("/emotion/text", response_model=TextEmotionResponse)
async def analyze_text_emotion(request: TextEmotionRequest) -> TextEmotionResponse:
    return await orchestrator.process_text_emotion(request)


@router.post("/voice/tts", response_model=TTSResponse)
async def synthesize_voice(request: TTSRequest) -> TTSResponse:
    return await orchestrator.synthesize_voice(request)


@router.get("/hume/status", response_model=HumeStatusResponse)
async def hume_status() -> HumeStatusResponse:
    return orchestrator.hume_status()


@router.post("/behavior/update", response_model=BehaviorUpdateResponse)
async def update_behavior(telemetry: BehaviorTelemetry) -> BehaviorUpdateResponse:
    return await orchestrator.process_behavior(telemetry)


@router.post("/assistant/respond", response_model=AssistantResponse)
async def assistant_respond(request: AssistantRequest) -> AssistantResponse:
    return await orchestrator.assistant_response(request)


@router.post("/demo/overload", response_model=DemoResponse)
async def demo_overload() -> DemoResponse:
    return await orchestrator.trigger_demo("overload")


@router.post("/demo/focus", response_model=DemoResponse)
async def demo_focus() -> DemoResponse:
    return await orchestrator.trigger_demo("focus")


@router.post("/demo/stress", response_model=DemoResponse)
async def demo_stress() -> DemoResponse:
    return await orchestrator.trigger_demo("stress")


@router.post("/demo/normalize", response_model=DemoResponse)
async def demo_normalize() -> DemoResponse:
    return await orchestrator.trigger_demo("normalize")


@router.get("/integration/schema")
async def integration_schema() -> dict:
    """Small frontend contract helper for hackathon integration."""
    state = await orchestrator.current_state()
    return {
        "websocket": "/ws/realtime",
        "hume_websockets": {
            "evi_proxy": "/ws/hume/evi",
            "tts_proxy": "/ws/hume/tts",
        },
        "events": [
            "cognitive.state",
            "emotion.update",
            "hume.emotion",
            "hume.text_emotion",
            "hume.transcription",
            "hume.audio_output",
            "adaptive.mode",
            "system.event",
            "reasoning.log",
            "assistant.status",
            "assistant.response",
            "behavior.analysis",
        ],
        "state_shape": model_to_dict(state),
        "demo_endpoints": ["/demo/overload", "/demo/focus", "/demo/stress", "/demo/normalize"],
        "hume_endpoints": ["/hume/status", "/emotion/text", "/voice/tts"],
    }
