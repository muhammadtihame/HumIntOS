from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
    load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
except Exception:
    pass


@dataclass(frozen=True)
class Settings:
    app_name: str = "HumIntOS"
    environment: str = os.getenv("HUMINTOS_ENV", "development")
    websocket_tick_seconds: float = float(os.getenv("HUMINTOS_TICK_SECONDS", "1.0"))
    reasoning_tick_seconds: float = float(os.getenv("HUMINTOS_REASONING_SECONDS", "2.5"))
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.1")
    hume_api_key: str = os.getenv("HUME_API_KEY", "")
    hume_config_id: str = os.getenv("HUME_CONFIG_ID", "")
    hume_evi_ws_url: str = os.getenv("HUME_EVI_WS_URL", "wss://api.hume.ai/v0/evi/chat")
    hume_tts_ws_url: str = os.getenv("HUME_TTS_WS_URL", "wss://api.hume.ai/v0/tts/stream/input")
    hume_tts_voice_name: str = os.getenv("HUME_TTS_VOICE_NAME", "Ava Song")
    hume_tts_voice_provider: str = os.getenv("HUME_TTS_VOICE_PROVIDER", "HUME_AI")
    hume_text_timeout_seconds: float = float(os.getenv("HUME_TEXT_TIMEOUT_SECONDS", "8.0"))
    hume_evi_verbose_transcription: bool = os.getenv("HUME_EVI_VERBOSE_TRANSCRIPTION", "true").lower() == "true"


settings = Settings()
