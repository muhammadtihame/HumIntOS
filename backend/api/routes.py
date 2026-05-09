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
    }


@router.get("/state/current", response_model=CognitiveState)
async def current_state() -> CognitiveState:
    return await orchestrator.current_state()


@router.post("/emotion/analyze", response_model=EmotionAnalysisResponse)
async def analyze_emotion(request: EmotionAnalyzeRequest) -> EmotionAnalysisResponse:
    return await orchestrator.process_emotion(request)


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


@router.post("/demo/normalize", response_model=DemoResponse)
async def demo_normalize() -> DemoResponse:
    return await orchestrator.trigger_demo("normalize")


@router.get("/integration/schema")
async def integration_schema() -> dict:
    """Small frontend contract helper for hackathon integration."""
    state = await orchestrator.current_state()
    return {
        "websocket": "/ws/realtime",
        "events": [
            "cognitive.state",
            "emotion.update",
            "adaptive.mode",
            "system.event",
            "reasoning.log",
            "assistant.status",
            "assistant.response",
            "behavior.analysis",
        ],
        "state_shape": model_to_dict(state),
        "demo_endpoints": ["/demo/overload", "/demo/focus", "/demo/normalize"],
    }

