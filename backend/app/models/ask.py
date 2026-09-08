from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.models.common import ChartPoint
from app.models.decline import DeclineExplanation


class AskRequest(BaseModel):
    question: str = Field(min_length=1)


class ParsedParams(BaseModel):
    horizon: Literal["week", "month", "year"]
    explicit_year: Optional[int] = None
    explicit_month: Optional[int] = None
    dimension: Optional[str] = None
    dimension_value: Optional[str] = None
    metrics: list[str]


class LlmCallLog(BaseModel):
    inputs: list[str]
    output: str


RefusalReason = Literal["unvalidated_dimension", "dimension_forecast_out_of_range", "unvalidated_metric",
                         "champion_too_unreliable"]


class MetricResult(BaseModel):
    metric: str
    status: Literal["ok", "refused", "failed"]

    # status == "refused"
    refusal_reason: Optional[RefusalReason] = None
    period_label: Optional[str] = None

    # status == "failed"  (new hardening -- see ask_service.py)
    error_message: Optional[str] = None

    # status == "ok"
    predicted_value: Optional[float] = None
    model_name: Optional[str] = None
    # The champion model's own backtested error for this exact scope/horizon -- None only when
    # is_actual (a real recorded value, not modeled) or when a model ran without one on record.
    error_pct: Optional[float] = None
    reason: Optional[str] = None
    is_actual: Optional[bool] = None
    periods_ahead: Optional[int] = None
    period_unit: Optional[Literal["week", "month", "year"]] = None
    confidence_level: Optional[Literal["high", "moderate", "low"]] = None
    confidence_reason: Optional[str] = None
    range_low: Optional[float] = None
    range_high: Optional[float] = None
    answer_text: Optional[str] = None
    chart_data: list[ChartPoint] = []


class AskResponse(BaseModel):
    status: Literal["answered", "dimension_refused", "decline_explained", "decline_failed"]
    parsed: ParsedParams
    parse_note: Optional[str] = None
    log: list[str]

    refused_dimension: Optional[str] = None

    # status == "decline_failed" (explain_decline itself never raises for a business-rule
    # outcome -- this is only for a genuine infra failure, e.g. the LLM classified "explain"
    # but the API was unreachable for the narration call)
    decline_error: Optional[str] = None

    metric_results: Optional[list[MetricResult]] = None
    decline: Optional[DeclineExplanation] = None
    llm_calls: Optional[list[LlmCallLog]] = None
