from typing import Literal, Optional

from pydantic import BaseModel

from app.models.common import ChartPoint


class KpiValue(BaseModel):
    """A single KPI figure -- value is None exactly when unavailable_reason is set (e.g. this
    metric/dimension combo was never backtested for forecasting), never a guessed 0 or omitted
    silently."""
    value: Optional[float] = None
    unavailable_reason: Optional[str] = None


class ScopeRow(BaseModel):
    """One dimension value's current-period status, plus whether this system can honestly
    forecast that scope at this grain (a champion exists AND it cleared the reliability floor)."""
    value: str
    target: float
    comparison: float
    delta: float
    delta_pct: Optional[float] = None
    direction: Literal["increase", "decrease", "flat"]
    champion_model: Optional[str] = None
    champion_error_pct: Optional[float] = None
    forecastable: bool


class ScopeMatrix(BaseModel):
    metric: str
    metric_label: str
    grain: Literal["week", "month", "year"]
    dimension: str
    period_label: Optional[str] = None
    comparison_label: Optional[str] = None
    rows: list[ScopeRow] = []


class DashboardSummary(BaseModel):
    year: int
    comparison_year: int
    metric: str
    metric_label: str
    dimension: Optional[str] = None
    dimension_value: Optional[str] = None
    grain: Literal["week", "month", "year"] = "year"
    # The KPI row's own current/comparison period -- distinct from forecast_period_label below
    # (which is the period the *forecast* covers, one step further out). Only set for
    # grain != "year" -- e.g. "week of Aug 24, 2026" -- since year/comparison_year already say
    # everything needed for grain == "year".
    current_period_label: Optional[str] = None
    comparison_period_label: Optional[str] = None

    total_sales: KpiValue
    total_sales_growth_pct: Optional[float] = None
    total_profit: KpiValue
    total_profit_growth_pct: Optional[float] = None

    forecast: KpiValue
    forecast_model: Optional[str] = None
    forecast_reason: Optional[str] = None
    forecast_period_label: Optional[str] = None
    forecast_is_actual: bool = False

    growth_pct: Optional[float] = None
    growth_direction: Optional[Literal["increase", "decrease", "flat"]] = None

    confidence_level: Optional[Literal["high", "moderate", "low"]] = None
    confidence_reason: Optional[str] = None

    # Real recorded history (last 24 months) for the trend chart, plus the one forecast point
    # to render as a distinct dashed segment -- None whenever the forecast itself is
    # unavailable or the target period is already a recorded actual (nothing to forecast).
    history_chart: list[ChartPoint] = []
    forecast_point: Optional[ChartPoint] = None
    # Every free candidate's own guess for forecast_point's exact target, keyed by model --
    # lets the chart show what every approach said, not just the champion. Empty whenever
    # there's no forecast to compare (an actual/recorded value, or the forecast itself failed).
    all_model_forecasts: dict[str, float] = {}
