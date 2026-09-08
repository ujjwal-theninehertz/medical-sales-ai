from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.common import ChartPoint


class PlaygroundRequest(BaseModel):
    metric: str
    dimension: Optional[str] = None
    dimension_value: Optional[str] = None
    year: Optional[str] = None
    month: Optional[str] = None
    freq: Literal["week", "month"] = "month"
    periods_ahead: int = Field(default=1, ge=1, le=36)


class ModelPrediction(BaseModel):
    value: float
    live_mape: Optional[float] = None
    historical_mape: Optional[float] = None


class PlaygroundResponse(BaseModel):
    validation_errors: Optional[list[str]] = None

    error: Optional[str] = None
    valid_values: Optional[list[str]] = None

    metric: Optional[str] = None
    dimension: Optional[str] = None
    dimension_value: Optional[str] = None
    target_period: Optional[date] = None
    periods_ahead: Optional[int] = None
    freq: Optional[Literal["W", "MS"]] = None
    is_backtest: Optional[bool] = None
    actual_value: Optional[float] = None
    year_only: Optional[bool] = None
    history_end: Optional[date] = None
    predictions: Optional[dict[str, ModelPrediction]] = None
    failures: Optional[dict[str, str]] = None
    history_chart: list[ChartPoint] = []
    # Claude's historical (offline-backtested) MAPE for this exact selection -- informational
    # only, never a live run. None whenever nothing real was ever backtested for this combo.
    claude_historical_mape: Optional[float] = None
    # Step-by-step trace of what actually ran: the resolved target, the train/test split, each
    # candidate's own input window and raw output, each candidate's score, and the final
    # ranking. Same contract as AskResponse.log -- real emitted steps, not a written summary.
    log: list[str] = []
