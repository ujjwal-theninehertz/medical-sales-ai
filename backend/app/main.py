"""
FastAPI entry point. `app.config` is imported first and deliberately -- it loads backend/.env
into os.environ before anything under app.core (forecasting_core, llm_client) is imported
anywhere in the process, so the API key is available the moment those modules need it.

app.core.forecasting_core is imported eagerly here (not lazily inside a request handler) so
CHAMPIONS/DIMENSIONAL_CHAMPIONS/DIMENSION_VALUES load once at startup and fail fast if the
data/JSON symlinks are broken -- reproducing the exact "load once per process" behavior the
original Streamlit app already had (those are module-level constants there too), not a new
caching layer.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import config  # noqa: F401 -- import order matters, see module docstring
from app.api import ask as ask_api
from app.api import backtests as backtests_api
from app.api import dashboard as dashboard_api
from app.api import export as export_api
from app.api import metadata as metadata_api
from app.api import playground as playground_api

logger = logging.getLogger("app.main")

app = FastAPI(title="Medical Sales Assistant API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(metadata_api.router)
app.include_router(playground_api.router)
app.include_router(ask_api.router)
app.include_router(dashboard_api.router)
app.include_router(backtests_api.router)
app.include_router(export_api.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled error on {request.method} {request.url.path}")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/health")
def health():
    return {"status": "ok", "llm_key_present": config.has_llm_key()}


@app.on_event("startup")
def startup():
    from app.core import forecasting_core  # eager import -- see module docstring
    logger.info(
        f"forecasting_core loaded: {len(forecasting_core.DIMENSION_VALUES)} dimensions, "
        f"{sum(len(v) for v in forecasting_core.DIMENSIONAL_CHAMPIONS.values())} dimensional champions, "
        f"llm_key_present={config.has_llm_key()}"
    )
    if not config.has_llm_key():
        logger.warning(
            "ANTHROPIC_API_KEY not set -- /api/metadata and actual-value lookups still work, "
            "but parse_query/phrase_answer/llm_predict (question understanding, phrasing, and "
            "the claude-haiku-4-5 forecast candidate) will fail per-request until it's set."
        )
