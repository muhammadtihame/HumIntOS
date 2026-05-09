from __future__ import annotations

import asyncio
from typing import Any, Dict, Set

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

from backend.models.schemas import RealtimeEnvelope, model_to_dict


class ConnectionManager:
    def __init__(self) -> None:
        self._active: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    @property
    def active_count(self) -> int:
        return len(self._active)

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._active.add(websocket)

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self._active.discard(websocket)

    async def send(self, websocket: WebSocket, event_type: str, payload: Dict[str, Any]) -> None:
        envelope = RealtimeEnvelope(type=event_type, payload=payload)
        await websocket.send_json(jsonable_encoder(model_to_dict(envelope)))

    async def broadcast(self, event_type: str, payload: Dict[str, Any]) -> None:
        envelope = RealtimeEnvelope(type=event_type, payload=payload)
        message = jsonable_encoder(model_to_dict(envelope))
        async with self._lock:
            sockets = list(self._active)
        if not sockets:
            return

        stale = []
        for websocket in sockets:
            try:
                await websocket.send_json(message)
            except Exception:
                stale.append(websocket)

        if stale:
            async with self._lock:
                for websocket in stale:
                    self._active.discard(websocket)

