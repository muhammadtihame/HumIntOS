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

