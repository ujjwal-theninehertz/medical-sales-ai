"""GET /api/backtests -- the offline backtest evidence behind every champion choice.

A GET with no params: this is static, already-measured data (the score_*.py scripts ran it
once against a real 2021-2024 -> 2025 holdout and wrote the results to disk), so there is
nothing to parameterise and nothing to recompute per request.
"""
import logging

from fastapi import APIRouter

from app.models.backtests import BacktestsResponse
from app.services.backtest_service import get_backtests

logger = logging.getLogger("app.api.backtests")
router = APIRouter()


@router.get("/api/backtests", response_model=BacktestsResponse)
def backtests():
    logger.info("backtests request")
    return get_backtests()
