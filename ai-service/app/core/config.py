import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional, Union


class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "Codebase Onboarder AI Engine"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8000
    DEBUG: bool = False

    # LLM Provider Configuration ("auto", "gemini", "openai")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "auto")

    # OpenAI Settings
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    OPENAI_EMBEDDING_MODEL: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")

    # Google Gemini Settings
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_BASE_URL: str = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-flash-latest")
    GEMINI_EMBEDDING_MODEL: str = os.getenv("GEMINI_EMBEDDING_MODEL", "gemini-embedding-001")

    # Embedding dimension override (optional; None or empty string means automatically derived from active model)
    EMBEDDING_DIM: Optional[Union[int, str]] = None

    # Qdrant Vector DB
    QDRANT_HOST: str = os.getenv("QDRANT_HOST", "localhost")
    QDRANT_PORT: int = int(os.getenv("QDRANT_PORT", "6333"))
    QDRANT_API_KEY: Optional[str] = os.getenv("QDRANT_API_KEY", None)
    QDRANT_COLLECTION: str = os.getenv("QDRANT_COLLECTION", "codebase_chunks")

    # Redis
    REDIS_HOST: str = os.getenv("REDIS_HOST", "localhost")
    REDIS_PORT: int = int(os.getenv("REDIS_PORT", "6379"))

    # Repositories storage path
    REPO_STORAGE_PATH: str = os.getenv("REPO_STORAGE_PATH", "./data/repos")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def is_gemini(self) -> bool:
        prov = self.LLM_PROVIDER.lower().strip()
        if prov == "gemini":
            return True
        if prov == "openai":
            return False
        # Auto-detection
        if self.GEMINI_API_KEY and self.GEMINI_API_KEY != "your_gemini_api_key_here":
            return True
        if self.OPENAI_API_KEY and self.OPENAI_API_KEY.startswith("AIza"):
            return True
        return False

    @property
    def active_provider(self) -> str:
        if self.is_gemini:
            return "gemini"
        if self.OPENAI_API_KEY and self.OPENAI_API_KEY != "your_openai_api_key_here":
            return "openai"
        return "none"

    @property
    def active_api_key(self) -> str:
        if self.is_gemini:
            if self.GEMINI_API_KEY and self.GEMINI_API_KEY != "your_gemini_api_key_here":
                return self.GEMINI_API_KEY
            if self.OPENAI_API_KEY and self.OPENAI_API_KEY.startswith("AIza"):
                return self.OPENAI_API_KEY
        return self.OPENAI_API_KEY

    @property
    def active_base_url(self) -> str:
        if self.is_gemini:
            return self.GEMINI_BASE_URL
        return self.OPENAI_BASE_URL

    @property
    def active_chat_model(self) -> str:
        if self.is_gemini:
            return self.GEMINI_MODEL
        return self.OPENAI_MODEL

    @property
    def active_embedding_model(self) -> str:
        if self.is_gemini:
            return self.GEMINI_EMBEDDING_MODEL
        return self.OPENAI_EMBEDDING_MODEL

    @property
    def active_embedding_dim(self) -> int:
        if self.EMBEDDING_DIM not in (None, ""):
            try:
                return int(self.EMBEDDING_DIM)
            except (ValueError, TypeError):
                pass
        env_dim = os.getenv("EMBEDDING_DIM")
        if env_dim and env_dim.isdigit():
            return int(env_dim)
        if self.is_gemini and self.GEMINI_EMBEDDING_MODEL == "text-embedding-004":
            return 768
        return 1536

    @property
    def is_llm_configured(self) -> bool:
        key = self.active_api_key
        return bool(
            key
            and key
            not in (
                "your_openai_api_key_here",
                "your_gemini_api_key_here",
                "dummy_key",
                "dummy_key_for_offline",
            )
        )


settings = Settings()
