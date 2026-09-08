"""Orchestration for POST /api/playground/run -- mirrors app.py's "Run models directly"
button handler (lines 409-488) almost line for line, just returning a structured response
instead of calling st.xxx(). Both year/month validators always run and both errors are
collected if both fields are invalid -- never short-circuit on the first, matching app.py's
`errors = [e for e in (year_err, month_err) if e]` exactly.
"""
import logging

import pandas as pd

from app.core.forecasting_core import resample_yearly, run_playground_forecast
from app.models.common import ChartPoint
from app.models.playground import ModelPrediction, PlaygroundRequest, PlaygroundResponse
from app.validation import parse_single_int_field, parse_single_month_field

logger = logging.getLogger("app.playground_service")


def _series_to_chart_points(series: pd.Series, dropna: bool) -> list[ChartPoint]:
    tail = series.tail(24)
    if dropna:
        tail = tail.dropna()
    return [ChartPoint(date=idx.date(), value=float(v)) for idx, v in tail.items()]


def run_playground(req: PlaygroundRequest) -> PlaygroundResponse:
    year_val, year_err = parse_single_int_field(req.year, "year", 1900, 2200)
    month_val, month_err = parse_single_month_field(req.month)
    errors = [e for e in (year_err, month_err) if e]
    if errors:
        return PlaygroundResponse(validation_errors=errors, history_chart=[])

    result = run_playground_forecast(
        metric=req.metric,
        dimension=req.dimension,
        dimension_value=req.dimension_value or None,
        target_year=year_val,
        target_month=month_val,
        periods_ahead=req.periods_ahead,
        freq="W" if req.freq == "week" else "MS",
    )

    if result["error"]:
        return PlaygroundResponse(
            error=result["error"],
            valid_values=result.get("valid_values"),
            history_chart=[],
        )

    predictions = {
        name: ModelPrediction(value=info["value"], live_mape=info["live_mape"],
                               historical_mape=info["historical_mape"])
        for name, info in result["predictions"].items()
    }

    # Playground's chart uses .tail(24) with NO dropna -- deliberately asymmetric with the Ask
    # flow's chart (which does dropna). Preserving the asymmetry, not "fixing" it -- it's
    # existing behavior, not a bug, and the instructions are explicit about not changing
    # behavior during migration.
    #
    # A year-only target's actual_value/predictions are full-YEAR totals (run_playground_
    # forecast sums 12 months) -- charting them against result["history"]'s raw monthly points
    # would plot that one point at ~12x the scale of every other, reading as a spike instead of
    # a trend. Resample to yearly totals first so every point on this chart is the same unit.
    history_series = resample_yearly(result["history"]) if result["year_only"] else result["history"]
    history_chart = _series_to_chart_points(history_series, dropna=False)

    return PlaygroundResponse(
        metric=result["metric"],
        dimension=result["dimension"],
        dimension_value=result["dimension_value"],
        target_period=result["target_period"].date(),
        periods_ahead=result["periods_ahead"],
        freq=result["freq"],
        is_backtest=result["is_backtest"],
        actual_value=result["actual_value"],
        year_only=result["year_only"],
        history_end=result["history"].index.max().date(),
        predictions=predictions,
        failures=result["failures"],
        history_chart=history_chart,
        claude_historical_mape=result.get("claude_historical_mape"),
        log=result.get("log", []),
    )
