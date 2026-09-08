"""Orchestration for GET /api/dashboard/summary -- the KPI row + trend chart's data source.
Every number here comes from functions that already exist and are already tested
(answer_question, compute_yoy_total, compute_period_total) -- this endpoint only aggregates
their outputs into one response so the dashboard doesn't need several separate round trips on
every filter change. Nothing here computes anything new; it's pure orchestration.

grain="year" keeps the ORIGINAL, already-tested path exactly (a specific picked year vs the
one before it, via compute_yoy_total). grain in ("week", "month") is new: always the latest
COMPLETE period vs the one before it (via compute_period_total), since there's no meaningful
"pick a specific past week" UI the way there is for years. AI Insights (explain_decline) stays
year-only regardless of grain -- that's a real, documented architectural limit (see
explain_service.py), not something this endpoint works around.
"""
import logging

import pandas as pd

from app.core.forecasting_core import (
    METRIC_LABELS,
    all_model_forecasts,
    answer_question,
    apply_display_names,
    compute_period_total,
    compute_yoy_total,
    load_series,
    resample_yearly,
)
from app.models.common import ChartPoint
from app.models.dashboard import DashboardSummary, KpiValue

logger = logging.getLogger("app.dashboard_service")

_FREQ = {"week": "W", "month": "MS", "year": "MS"}  # year's own chart still resamples FROM monthly


def _latest_year() -> int:
    return int(load_series("MS", "net_sales").index.max().year)


def _chart_points(series: pd.Series, grain: str) -> list[ChartPoint]:
    tail = resample_yearly(series).tail(6) if grain == "year" else series.tail(24).dropna()
    return [ChartPoint(date=idx.date(), value=float(v)) for idx, v in tail.items()]


def _kpi_total_year(metric: str, year: int, dimension: str | None, dimension_value: str | None):
    yoy = compute_yoy_total(metric=metric, target_year=year, dimension=dimension, dimension_value=dimension_value)
    return KpiValue(value=yoy["target"]), yoy["delta_pct"]


def _kpi_total_period(metric: str, grain: str, dimension: str | None, dimension_value: str | None):
    p = compute_period_total(metric=metric, grain=grain, dimension=dimension, dimension_value=dimension_value)
    return KpiValue(value=p["target"], unavailable_reason=None if p["target"] is not None
                     else "not enough recorded history at this grain yet"), p["delta_pct"]


def get_dashboard_summary(metric: str, dimension: str | None, dimension_value: str | None,
                           grain: str, year: int | None) -> DashboardSummary:
    metric_label = METRIC_LABELS.get(metric, metric)

    if grain == "year":
        year = year or _latest_year()
        comparison_year = year - 1
        total_sales, sales_growth = _kpi_total_year("net_sales", year, dimension, dimension_value)
        total_profit, profit_growth = _kpi_total_year("profit", year, dimension, dimension_value)
        growth = compute_yoy_total(metric=metric, target_year=year, dimension=dimension, dimension_value=dimension_value)
        growth_pct, growth_direction = growth["delta_pct"], growth["direction"]
        forecast_target_year = year + 1
        forecast_kwargs = {"target_year": forecast_target_year}
        default_forecast_date = pd.Timestamp(year=forecast_target_year, month=12, day=31).date()
    else:
        # Month/week: always the latest complete period -- "year" here is only for the
        # response's own bookkeeping fields (which the frontend ignores at these grains).
        year = year or _latest_year()
        comparison_year = year
        total_sales, sales_growth = _kpi_total_period("net_sales", grain, dimension, dimension_value)
        total_profit, profit_growth = _kpi_total_period("profit", grain, dimension, dimension_value)
        growth = compute_period_total(metric=metric, grain=grain, dimension=dimension, dimension_value=dimension_value)
        growth_pct, growth_direction = growth["delta_pct"], growth["direction"]
        forecast_kwargs = {}  # no explicit target -- "next week"/"next month", relative to the data's own end
        default_forecast_date = None

    # Forecast for the SELECTED metric/scope, via the same validated answer_question() path
    # the Ask flow uses -- inherits its champion lookup, confidence decay, and refusal rules
    # exactly. A refusal becomes an honest "not available" KPI card and an empty forecast
    # point, never a fabricated number. result["series"] doubles as the chart's historical
    # line, so the forecast and the chart are always drawn from the same underlying data.
    history_chart: list[ChartPoint] = []
    forecast_point: ChartPoint | None = None
    all_forecasts: dict[str, float] = {}
    try:
        result = answer_question(horizon=grain, metric=metric, dimension=dimension,
                                  dimension_value=dimension_value, **forecast_kwargs)
    except Exception as e:
        logger.exception("answer_question failed for dashboard forecast/chart")
        result = {"out_of_range": True, "reason_override": f"couldn't be computed right now: {e}"}

    if result.get("out_of_range"):
        if result.get("reason_override"):
            reason = result["reason_override"]
        elif result.get("unvalidated_dimension"):
            reason = f"forecasting isn't validated for {dimension} at this level yet"
        elif result.get("champion_too_unreliable"):
            reason = "the best available model for this was tested and found too unreliable to trust"
        elif result.get("dimension_forecast_out_of_range"):
            reason = "dimension-level forecasts only cover next month, not a full year"
        else:
            reason = f"{metric_label} has never been backtested for forecasting at {grain} grain"
        forecast = KpiValue(unavailable_reason=reason)
        forecast_model = forecast_reason = forecast_period_label = confidence_level = confidence_reason = None
        forecast_is_actual = False
        history_chart = _chart_points(load_series(_FREQ[grain], metric, dimension, dimension_value), grain)
    else:
        forecast = KpiValue(value=result["predicted_value"])
        # apply_display_names -- reason/period_label are built from the real internal
        # dimension_value ("Medical Branch 01") whenever this is scoped to a branch/route/etc.,
        # and unlike the Ask flow's own MetricResult this endpoint never ran them through the
        # cosmetic name-mapping layer before reaching the client.
        forecast_model = result.get("model_name")
        forecast_reason = apply_display_names(result.get("reason"))
        forecast_period_label = apply_display_names(result.get("period_label"))
        forecast_is_actual = bool(result.get("is_actual"))
        confidence_level, confidence_reason = result.get("confidence_level"), result.get("confidence_reason")
        history_chart = _chart_points(result["series"], grain)
        if not forecast_is_actual:
            last_date = result["series"].index.max()
            fp_date = default_forecast_date or (
                (last_date + pd.DateOffset(weeks=1)).date() if grain == "week"
                else (last_date + pd.DateOffset(months=1)).date()
            )
            forecast_point = ChartPoint(date=fp_date, value=result["predicted_value"])

            # Every other candidate's own guess for this exact same target -- so the chart can
            # show "here's what every approach said" with the champion (already known, never
            # re-run) highlighted among them. Best-effort: a chart that can't show every
            # candidate's dot still shows the champion's real one.
            try:
                all_forecasts = all_model_forecasts(
                    result["series"], steps_ahead=12 if grain == "year" else 1, freq=_FREQ[grain],
                    metric_label=metric_label, dimension=dimension, dimension_value=dimension_value,
                    known={forecast_model: result["predicted_value"]} if forecast_model else None,
                )
            except Exception:
                logger.exception("all_model_forecasts failed for dashboard chart -- showing champion only")
                all_forecasts = {forecast_model: result["predicted_value"]}

    return DashboardSummary(
        year=year, comparison_year=comparison_year, metric=metric, metric_label=metric_label,
        dimension=dimension, dimension_value=dimension_value, grain=grain,
        current_period_label=growth.get("period_label") if grain != "year" else None,
        comparison_period_label=growth.get("comparison_label") if grain != "year" else None,
        total_sales=total_sales, total_sales_growth_pct=sales_growth,
        total_profit=total_profit, total_profit_growth_pct=profit_growth,
        forecast=forecast, forecast_model=forecast_model, forecast_reason=forecast_reason,
        forecast_period_label=forecast_period_label, forecast_is_actual=forecast_is_actual,
        growth_pct=growth_pct, growth_direction=growth_direction,
        confidence_level=confidence_level, confidence_reason=confidence_reason,
        history_chart=history_chart, forecast_point=forecast_point, all_model_forecasts=all_forecasts,
    )
