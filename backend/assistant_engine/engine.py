from __future__ import annotations

import time
from typing import Dict, Optional

import httpx

from backend.models.schemas import AssistantRequest, AssistantResponse, CognitiveState
from backend.utils.config import settings


class AdaptiveAssistantEngine:
    async def respond(self, request: AssistantRequest, state: CognitiveState) -> AssistantResponse:
        started = time.perf_counter()
        state_context = {
            "stress_level": state.stress_level,
            "focus_level": state.focus_level,
            "cognitive_load": state.cognitive_load,
            "emotion": state.emotion,
            "fatigue": state.fatigue,
            "active_mode": state.active_mode,
        }
        system_prompt = self._build_system_prompt(state)

        model = "humintos-simulated-assistant"
        response_text: Optional[str] = None

        if settings.openai_api_key:
            response_text = await self._try_openai(system_prompt, request.message)
            model = settings.openai_model if response_text else model

        if response_text is None and settings.ollama_base_url:
            response_text = await self._try_ollama(system_prompt, request.message)
            model = settings.ollama_model if response_text else model

        if response_text is None:
            response_text = self._fallback_response(request.message, state)

        latency_ms = int((time.perf_counter() - started) * 1000)
        return AssistantResponse(
            response=response_text,
            mode=state.active_mode,
            style=state.assistant_style,
            model=model,
            latency_ms=latency_ms,
            state_context=state_context,
        )

    def _build_system_prompt(self, state: CognitiveState) -> str:
        style_guidance = {
            "calming_stepwise": "Use calm language. Acknowledge pressure briefly. Break the next action into small steps.",
            "concise_technical": "Be concise, technical, and direct. Avoid motivational filler.",
            "simplified_guided": "Reduce complexity. Chunk tasks. Use short numbered steps and confirm the next move.",
            "balanced_collaborative": "Be clear, warm, and practical. Give useful structure without being verbose.",
        }.get(state.assistant_style, "Be clear, warm, and practical.")
        return (
            "You are HumIntOS, a human-aware cognitive operating system assistant.\n"
            f"Current cognitive state: stress={state.stress_level}, focus={state.focus_level}, "
            f"load={state.cognitive_load}, emotion={state.emotion}, fatigue={state.fatigue}, "
            f"mode={state.active_mode}, style={state.assistant_style}.\n"
            f"Adaptive behavior: {style_guidance}\n"
            "Do not mention that the state may be simulated. Respond as if you are adapting in realtime."
        )

    async def _try_openai(self, system_prompt: str, message: str) -> Optional[str]:
        try:
            from openai import AsyncOpenAI  # type: ignore

            client = AsyncOpenAI(api_key=settings.openai_api_key)
            completion = await client.chat.completions.create(
                model=settings.openai_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": message},
                ],
                temperature=0.55,
                max_tokens=420,
            )
            return completion.choices[0].message.content or None
        except Exception:
            return None

    async def _try_ollama(self, system_prompt: str, message: str) -> Optional[str]:
        try:
            prompt = f"{system_prompt}\n\nUser: {message}\nHumIntOS:"
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(
                    f"{settings.ollama_base_url.rstrip('/')}/api/generate",
                    json={"model": settings.ollama_model, "prompt": prompt, "stream": False},
                )
                response.raise_for_status()
                data = response.json()
                return data.get("response")
        except Exception:
            return None

    def _fallback_response(self, message: str, state: CognitiveState) -> str:
        subject = message.strip()
        if len(subject) > 90:
            subject = subject[:87].rstrip() + "..."

        if state.active_mode == "cognitive_overload_mode":
            return (
                "I’m simplifying this. First, isolate one failing path and ignore the rest for a moment.\n\n"
                f"1. Restate the issue in one sentence: `{subject}`\n"
                "2. Capture the exact error or unexpected behavior.\n"
                "3. Change one variable at a time.\n\n"
                "Send me the smallest failing snippet and I’ll guide the next step."
            )
        if state.active_mode == "stress_mode":
            return (
                "Let’s make this manageable. You don’t need to solve everything at once.\n\n"
                "Start with the visible symptom, then check the most recent change, then run the narrowest test you have. "
                "I’ll keep the path short and steady."
            )
        if state.active_mode == "focus_mode":
            return (
                "Fast path: identify the failing boundary, inspect inputs/outputs there, then patch the smallest owner. "
                "Share the stack trace or relevant function and I’ll go straight to the likely fault."
            )
        return (
            "I can help. Give me the error, the expected behavior, and the file or component involved. "
            "I’ll map the likely cause and propose the smallest useful fix."
        )

