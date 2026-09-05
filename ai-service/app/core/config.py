import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    # App
    PROJECT_NAME: str = "Codebase Onboarder AI Engine"
    API_V1_STR: str = "/api/v1"
    PORT: int = 8000
    DEBUG: bool = False

    # OpenAI / Compatible LLM
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    OPENAI_BASE_URL: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    OPENAI_MODEL: str = os.getenv("OPENAI_MODEL", "gpt-4o")
    OPENAI_EMBEDDING_MODEL: str = os.getenv("OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")
    EMBEDDING_DIM: int = 1536

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


settings = Settings()
