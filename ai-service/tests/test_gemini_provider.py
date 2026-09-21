import pytest
from app.core.config import Settings
from app.chunker.code_chunker import CodeAwareChunker
from fastapi.testclient import TestClient
from app.main import app


def test_gemini_auto_detection():
    # Test with GEMINI_API_KEY provided
    cfg = Settings(
        GEMINI_API_KEY="AIzaSyDummyGeminiKey1234567890abcdef",
        OPENAI_API_KEY="",
        _env_file=None,
    )
    assert cfg.is_gemini is True
    assert cfg.active_provider == "gemini"
    assert cfg.active_chat_model == "gemini-flash-latest"
    assert cfg.active_embedding_model == "gemini-embedding-001"
    assert cfg.active_embedding_dim == 1536
    assert cfg.active_base_url == "https://generativelanguage.googleapis.com/v1beta/openai/"
    assert cfg.is_llm_configured is True


def test_gemini_key_in_openai_var():
    # Test auto-detection if user pasted AIza... key into OPENAI_API_KEY
    cfg = Settings(
        OPENAI_API_KEY="AIzaSyDummyGeminiKeyInOpenAIVar12345",
        GEMINI_API_KEY="",
        _env_file=None,
    )
    assert cfg.is_gemini is True
    assert cfg.active_provider == "gemini"
    assert cfg.active_embedding_dim == 1536
    assert cfg.active_chat_model == "gemini-flash-latest"


def test_explicit_provider_override():
    # Explicitly force openai even if gemini key is present
    cfg = Settings(
        LLM_PROVIDER="openai",
        OPENAI_API_KEY="sk-123456789012345678901234567890",
        GEMINI_API_KEY="AIzaSyDummyGeminiKey1234567890abcdef",
        _env_file=None,
    )
    assert cfg.is_gemini is False
    assert cfg.active_provider == "openai"
    assert cfg.active_embedding_dim == 1536
    assert cfg.active_chat_model == "gpt-4o"

    # Explicitly force gemini
    cfg_gem = Settings(
        LLM_PROVIDER="gemini",
        OPENAI_API_KEY="sk-123456789012345678901234567890",
        GEMINI_API_KEY="AIzaSyDummyGeminiKey1234567890abcdef",
        _env_file=None,
    )
    assert cfg_gem.is_gemini is True
    assert cfg_gem.active_provider == "gemini"


def test_custom_gemini_model_and_dim():
    cfg = Settings(
        GEMINI_API_KEY="AIzaSyDummyGeminiKey1234567890abcdef",
        GEMINI_MODEL="gemini-2.0-flash",
        EMBEDDING_DIM=768,
        _env_file=None,
    )
    assert cfg.active_chat_model == "gemini-2.0-flash"
    assert cfg.active_embedding_dim == 768


def test_secret_scrubbing_gemini_key():
    code = 'const key = "AIzaSyD-1234567890abcdefghijklmnopqrst";'
    sanitized = CodeAwareChunker.scrub_secrets(code)
    assert "AIzaSyD-1234567890abcdefghijklmnopqrst" not in sanitized
    assert "[REDACTED_GEMINI_KEY]" in sanitized


def test_health_endpoint_metadata():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert "llm_provider" in data
    assert "llm_model" in data
    assert "embedding_model" in data
    assert "llm_configured" in data
    assert "openai_configured" in data
