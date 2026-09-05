import logging
import sys
import re


class SensitiveDataFilter(logging.Filter):
    """
    Log filter that intercepts log records and scrubs API keys, Bearer tokens,
    and credentials before writing to stream.
    """

    PATTERNS = [
        (re.compile(r"sk-[A-Za-z0-9_\-]{20,}"), "[REDACTED_OPENAI_KEY]"),
        (re.compile(r"gh[pousr][_-][A-Za-z0-9_]{20,}"), "[REDACTED_GITHUB_TOKEN]"),
        (re.compile(r"AKIA[0-9A-Z]{16}"), "[REDACTED_AWS_KEY]"),
        (re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE), "Bearer [REDACTED_TOKEN]"),
        (re.compile(r"(?i)(password|secret|token|apiKey|api_key)=([^&\s]+)"), r"\1=[REDACTED]"),
    ]

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            for pattern, replacement in self.PATTERNS:
                record.msg = pattern.sub(replacement, record.msg)
        return True


def setup_logger(name: str = "ai_engine") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(logging.INFO)
        handler.addFilter(SensitiveDataFilter())
        formatter = logging.Formatter(
            "[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.addFilter(SensitiveDataFilter())
    return logger


logger = setup_logger()
