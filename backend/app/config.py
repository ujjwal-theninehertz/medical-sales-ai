"""
Central place environment/config gets loaded, BEFORE anything in app.core is imported
anywhere else in the app. Order matters: app.core.llm_client._load_env_file() uses
os.environ.setdefault(...), so once this module has already populated ANTHROPIC_API_KEY
(from backend/.env, the conventional top-level location), llm_client's own loader becomes a
harmless no-op -- llm_client.py stays byte-identical to the original, untouched.
"""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / ".env")

CORS_ORIGINS = [o.strip() for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",") if o.strip()]

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


def has_llm_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))
