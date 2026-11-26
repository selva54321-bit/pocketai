from dataclasses import dataclass
import os

@dataclass
class Settings:
    HOST: str = os.getenv("POCKETAI_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("POCKETAI_PORT", "8000"))
    CONFIDENCE_THRESHOLD: float = float(os.getenv("POCKETAI_CONFIDENCE_THRESHOLD", "0.70"))
    ENABLE_TELEMETRY: bool = False

settings = Settings()
