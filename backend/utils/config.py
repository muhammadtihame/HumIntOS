from __future__ import annotations

import os
from dataclasses import dataclass

try:
    from dotenv import load_dotenv

    load_dotenv()
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


settings = Settings()
