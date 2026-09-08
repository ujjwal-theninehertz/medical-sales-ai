"""POST /api/playground/run -- deliberately bypasses the validation gate /api/ask enforces
(see forecasting_core.run_playground_forecast's own docstring). Every business-rule outcome
(validation error, computation error, success) returns HTTP 200 with a discriminating field --
these are correct, understood responses to a request the model legitimately can't run or
won't trust, not malformed requests or server faults. Non-200 is reserved for a genuine
unhandled server error (caught by main.py's global exception handler).
"""
import logging

from fastapi import APIRouter

from app.models.playground import PlaygroundRequest, PlaygroundResponse
from app.services.playground_service import run_playground

logger = logging.getLogger("app.api.playground")
router = APIRouter()


@router.post("/api/playground/run", response_model=PlaygroundResponse)
def playground_run(req: PlaygroundRequest):
    logger.info(f"playground request: metric={req.metric!r} dimension={req.dimension!r} "
                f"value={req.dimension_value!r} year={req.year!r} month={req.month!r} "
                f"freq={req.freq!r} periods_ahead={req.periods_ahead}")
    return run_playground(req)
