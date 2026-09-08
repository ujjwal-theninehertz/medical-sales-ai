"""POST /api/ask -- always HTTP 200 for a business-rule outcome (answered, dimension_refused,
or a per-metric refused/failed inside the response), same reasoning as /api/playground/run.
Non-200 is reserved for a genuine unhandled server error.
"""
import logging

from fastapi import APIRouter

from app.models.ask import AskRequest, AskResponse
from app.services.ask_service import answer

logger = logging.getLogger("app.api.ask")
router = APIRouter()


@router.post("/api/ask", response_model=AskResponse)
def ask(req: AskRequest):
    logger.info(f"ask request: question={req.question!r}")
    return answer(req.question)
