from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.runtime import orchestrator


router = APIRouter()


@router.websocket("/ws/realtime")
async def websocket_realtime(websocket: WebSocket) -> None:
    try:
        await orchestrator.websocket_session(websocket)
    except WebSocketDisconnect:
        await orchestrator.connections.disconnect(websocket)


@router.websocket("/ws/hume/evi")
async def websocket_hume_evi(websocket: WebSocket) -> None:
    try:
        await orchestrator.hume_evi_session(websocket)
    except WebSocketDisconnect:
        return


@router.websocket("/ws/hume/tts")
async def websocket_hume_tts(websocket: WebSocket) -> None:
    try:
        await orchestrator.hume_tts_session(websocket)
    except WebSocketDisconnect:
        return
