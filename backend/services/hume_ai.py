from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, Iterable, Mapping, Optional, Tuple
from urllib.parse import urlencode

from backend.models.schemas import (
    CognitiveState,
    HumeEmotionSignals,
    HumeStatusResponse,
    TextEmotionRequest,
    TextEmotionResponse,
    TTSRequest,
    TTSResponse,
)
from backend.utils.config import settings
from backend.utils.math import clamp


ExpressionWeights = Iterable[Tuple[str, float]]


class HumeAIService:
    """Secure Hume API adapter with deterministic fallbacks for demos."""

    @property
    def configured(self) -> bool:
        return bool(settings.hume_api_key)

    def status(self) -> HumeStatusResponse:
        return HumeStatusResponse(
            configured=self.configured,
            api_key_present=bool(settings.hume_api_key),
            evi_configured=bool(settings.hume_api_key and settings.hume_config_id),
            evi_config_id_present=bool(settings.hume_config_id),
            tts_voice_name=settings.hume_tts_voice_name or None,
            expression_api_note=(
                "Hume Expression Measurement is integrated for text/prosody emotion signals. "
                "Hume docs list a June 14, 2026 API sunset, so keep EVI as the long-term realtime path."
            ),
            endpoints={
                "text_emotion": "/emotion/text",
                "tts": "/voice/tts",
                "evi_websocket_proxy": "/ws/hume/evi",
                "tts_websocket_proxy": "/ws/hume/tts",
            },
        )

    def evi_websocket_url(self) -> str:
        query: Dict[str, str] = {"api_key": settings.hume_api_key}
        if settings.hume_config_id:
            query["config_id"] = settings.hume_config_id
        if settings.hume_evi_verbose_transcription:
            query["verbose_transcription"] = "true"
        return f"{settings.hume_evi_ws_url}?{urlencode(query)}"

    def tts_websocket_url(self) -> str:
        query = {
            "api_key": settings.hume_api_key,
            "instant_mode": "true",
            "strip_headers": "true",
            "no_binary": "true",
        }
        return f"{settings.hume_tts_ws_url}?{urlencode(query)}"

    async def analyze_text(self, request: TextEmotionRequest, state: CognitiveState) -> TextEmotionResponse:
        started = time.perf_counter()
        if self.configured:
            try:
                response = await asyncio.wait_for(
                    self._analyze_text_with_hume(request),
                    timeout=settings.hume_text_timeout_seconds,
                )
                response.latency_ms = int((time.perf_counter() - started) * 1000)
                return response
            except Exception as exc:
                fallback = self._simulate_text_emotion(request.text, state, source="hume-expression-fallback")
                fallback.raw = {"error": str(exc)[:220]}
                fallback.latency_ms = int((time.perf_counter() - started) * 1000)
                return fallback

        fallback = self._simulate_text_emotion(request.text, state, source="simulated-hume-expression")
        fallback.latency_ms = int((time.perf_counter() - started) * 1000)
        return fallback

    async def synthesize_tts(self, request: TTSRequest, state: CognitiveState) -> TTSResponse:
        started = time.perf_counter()
        description = request.description or self._tts_description_for_state(state)
        voice_name = request.voice_name or settings.hume_tts_voice_name
        voice_provider = request.voice_provider or settings.hume_tts_voice_provider

        if not self.configured:
            return TTSResponse(
                provider="simulated-hume-tts",
                configured=False,
                voice_name=voice_name,
                voice_provider=voice_provider,
                description=description,
                fallback_text=request.text,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )

        try:
            client_cls = self._import_async_hume_client()
            from hume.tts import PostedUtterance, PostedUtteranceVoiceWithName  # type: ignore

            hume = client_cls(api_key=settings.hume_api_key)
            utterance = PostedUtterance(
                text=request.text,
                description=description,
                voice=PostedUtteranceVoiceWithName(name=voice_name, provider=voice_provider),
            )
            stream = hume.tts.synthesize_json_streaming(
                utterances=[utterance],
                strip_headers=request.strip_headers,
                version="1",
            )

            chunks = []
            generation_ids = []
            async for chunk in stream:
                audio = getattr(chunk, "audio", None)
                if audio:
                    chunks.append(audio)
                generation_id = getattr(chunk, "generation_id", None)
                if generation_id and generation_id not in generation_ids:
                    generation_ids.append(generation_id)

            return TTSResponse(
                provider="hume-tts",
                configured=True,
                voice_name=voice_name,
                voice_provider=voice_provider,
                audio_chunks=chunks,
                generation_ids=generation_ids,
                description=description,
                latency_ms=int((time.perf_counter() - started) * 1000),
            )
        except Exception as exc:
            return TTSResponse(
                provider="hume-tts-fallback",
                configured=True,
                voice_name=voice_name,
                voice_provider=voice_provider,
                description=description,
                fallback_text=request.text,
                latency_ms=int((time.perf_counter() - started) * 1000),
                audio_chunks=[],
                generation_ids=[],
                error=str(exc)[:220],
            )

    def signals_from_hume_scores(
        self,
        scores: Mapping[str, Any],
        source: str = "hume",
        transcript: Optional[str] = None,
    ) -> HumeEmotionSignals:
        normalized = self._normalize_scores(scores)
        if not normalized:
            return HumeEmotionSignals(source=source, transcript=transcript)

        top = dict(sorted(normalized.items(), key=lambda item: item[1], reverse=True)[:8])
        dominant = next(iter(top.keys()), "neutral")
        stress = self._weighted_signal(
            normalized,
            (
                ("anxiety", 1.0),
                ("distress", 1.0),
                ("fear", 0.9),
                ("anger", 0.8),
                ("annoyance", 0.65),
                ("disapproval", 0.45),
                ("pain", 0.55),
            ),
        )
        hesitation = self._weighted_signal(
            normalized,
            (
                ("doubt", 1.0),
                ("awkwardness", 0.9),
                ("anxiety", 0.7),
                ("embarrassment", 0.55),
                ("confusion", 0.8),
                ("boredom", 0.35),
            ),
        )
        engagement = self._weighted_signal(
            normalized,
            (
                ("interest", 1.0),
                ("concentration", 1.0),
                ("enthusiasm", 0.9),
                ("excitement", 0.85),
                ("realization", 0.55),
                ("surprise positive", 0.45),
            ),
        )
        empathy = self._weighted_signal(
            normalized,
            (
                ("sympathy", 1.0),
                ("gratitude", 0.75),
                ("love", 0.55),
                ("admiration", 0.5),
                ("sadness", 0.35),
            ),
        )
        confidence_base = self._weighted_signal(
            normalized,
            (
                ("determination", 1.0),
                ("pride", 0.72),
                ("concentration", 0.75),
                ("satisfaction", 0.62),
                ("calmness", 0.55),
            ),
        )
        confidence = clamp(confidence_base + engagement * 0.18 + (1.0 - stress) * 0.18 - hesitation * 0.28, 0.0, 1.0)

        return HumeEmotionSignals(
            stress=round(stress, 3),
            confidence=round(confidence, 3),
            empathy=round(empathy, 3),
            hesitation=round(hesitation, 3),
            engagement=round(engagement, 3),
            dominant_emotion=dominant,
            top_emotions={name: round(score, 3) for name, score in top.items()},
            transcript=transcript,
            source=source,
        )

    async def _analyze_text_with_hume(self, request: TextEmotionRequest) -> TextEmotionResponse:
        client_cls = self._import_async_hume_client()
        from hume.expression_measurement.stream import Config, StreamLanguage  # type: ignore

        client = client_cls(api_key=settings.hume_api_key)
        async with client.expression_measurement.stream.connect() as socket:
            result = await socket.send_text(
                text=request.text,
                config=Config(language=StreamLanguage(granularity="sentence")),
            )

        scores = self._scores_from_language_result(result)
        signals = self.signals_from_hume_scores(scores, source="hume-expression-language", transcript=request.text)
        return TextEmotionResponse(
            text=request.text,
            provider="hume-expression-language",
            signals=signals,
            raw={"top_emotions": signals.top_emotions},
        )

    def _scores_from_language_result(self, result: Any) -> Dict[str, float]:
        predictions = []
        language = getattr(result, "language", None)
        if language is not None:
            predictions = list(getattr(language, "predictions", []) or [])
        elif isinstance(result, Mapping):
            language = result.get("language", {})
            predictions = language.get("predictions", []) if isinstance(language, Mapping) else []

        totals: Dict[str, float] = {}
        count = 0
        for prediction in predictions:
            emotions = getattr(prediction, "emotions", None)
            if emotions is None and isinstance(prediction, Mapping):
                emotions = prediction.get("emotions")
            if not emotions:
                continue
            count += 1
            for emotion in emotions:
                name = getattr(emotion, "name", None)
                score = getattr(emotion, "score", None)
                if isinstance(emotion, Mapping):
                    name = emotion.get("name", name)
                    score = emotion.get("score", score)
                if name is None or score is None:
                    continue
                key = self._score_key(str(name))
                totals[key] = totals.get(key, 0.0) + float(score)

        if count <= 1:
            return totals
        return {name: score / count for name, score in totals.items()}

    def _simulate_text_emotion(self, text: str, state: CognitiveState, source: str) -> TextEmotionResponse:
        lower = text.lower()
        scores: Dict[str, float] = {
            "calmness": 0.14 + (100 - state.stress_level) / 600.0,
            "concentration": state.focus_level / 220.0,
            "interest": state.engagement_level / 200.0,
            "doubt": state.hesitation_level / 210.0,
            "anxiety": state.stress_level / 230.0,
        }
        stress_words = ("stuck", "broken", "urgent", "panic", "stress", "worried", "confused", "overwhelmed", "debug")
        confidence_words = ("sure", "clear", "ship", "done", "fixed", "understand", "confident")
        empathy_words = ("please", "thanks", "help", "appreciate", "sorry")
        hesitation_words = ("maybe", "not sure", "i think", "probably", "hmm", "why", "how")
        engagement_words = ("build", "create", "improve", "optimize", "design", "integrate")

        for word in stress_words:
            if word in lower:
                scores["anxiety"] = scores.get("anxiety", 0.0) + 0.08
                scores["distress"] = scores.get("distress", 0.0) + 0.05
        for word in confidence_words:
            if word in lower:
                scores["determination"] = scores.get("determination", 0.0) + 0.09
        for word in empathy_words:
            if word in lower:
                scores["gratitude"] = scores.get("gratitude", 0.0) + 0.07
                scores["sympathy"] = scores.get("sympathy", 0.0) + 0.03
        for word in hesitation_words:
            if word in lower:
                scores["doubt"] = scores.get("doubt", 0.0) + 0.08
                scores["awkwardness"] = scores.get("awkwardness", 0.0) + 0.04
        for word in engagement_words:
            if word in lower:
                scores["interest"] = scores.get("interest", 0.0) + 0.08
                scores["enthusiasm"] = scores.get("enthusiasm", 0.0) + 0.04

        if "!" in text:
            scores["excitement"] = scores.get("excitement", 0.0) + min(0.16, text.count("!") * 0.04)
        if "?" in text:
            scores["doubt"] = scores.get("doubt", 0.0) + min(0.14, text.count("?") * 0.035)

        bounded = {name: clamp(score, 0.0, 1.0) for name, score in scores.items()}
        signals = self.signals_from_hume_scores(bounded, source=source, transcript=text)
        return TextEmotionResponse(
            text=text,
            provider=source,
            signals=signals,
            raw={"simulated": True, "top_emotions": signals.top_emotions},
        )

    def _tts_description_for_state(self, state: CognitiveState) -> str:
        if state.active_mode == "cognitive_overload_mode":
            return "Speak slowly, warmly, and reassuringly. Use a clear guided tone with gentle pauses."
        if state.active_mode == "stress_mode":
            return "Sound calm, grounded, and supportive, like a focused coach reducing pressure."
        if state.active_mode == "focus_mode":
            return "Sound crisp, concise, confident, and technically precise with minimal ornament."
        if state.empathy_level > 70:
            return "Sound attentive, emotionally present, and quietly encouraging."
        return "Sound clear, modern, composed, and collaborative."

    def _weighted_signal(self, scores: Mapping[str, float], weights: ExpressionWeights) -> float:
        total_weight = 0.0
        total_score = 0.0
        peak_score = 0.0
        for name, weight in weights:
            total_weight += weight
            weighted = scores.get(self._score_key(name), 0.0) * weight
            total_score += weighted
            peak_score = max(peak_score, weighted)
        if total_weight <= 0:
            return 0.0
        average_score = total_score / total_weight
        return clamp(peak_score * 0.78 + average_score * 0.9, 0.0, 1.0)

    def _normalize_scores(self, scores: Mapping[str, Any]) -> Dict[str, float]:
        normalized: Dict[str, float] = {}
        for name, score in scores.items():
            try:
                normalized[self._score_key(str(name))] = clamp(float(score), 0.0, 1.0)
            except (TypeError, ValueError):
                continue
        return normalized

    def _score_key(self, name: str) -> str:
        return name.strip().lower().replace("(", "").replace(")", "").replace("-", " ")

    def _import_async_hume_client(self) -> Any:
        try:
            from hume import AsyncHumeClient  # type: ignore

            return AsyncHumeClient
        except Exception:
            from hume.client import AsyncHumeClient  # type: ignore

            return AsyncHumeClient
