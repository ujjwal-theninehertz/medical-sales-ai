"""Orchestration for POST /api/ask -- mirrors app.py's "if ask_clicked and question" block
(lines 131-347) as closely as possible, returning a structured response instead of calling
st.xxx(). Every `.get(key, default)` fallback below is copied deliberately, not "cleaned up" --
e.g. an actual-value result has no confidence_level key at all, and defaulting it to "high"
with an empty confidence_reason is existing, preserved behavior, not something to fix here.

One recommended, explicitly-new hardening: each metric's answer_question() call is wrapped in
its own try/except for LLMError, so one metric's infra failure (e.g. the Anthropic API being
down on a request that happens to need claude-haiku-4-5) can't take down metrics that don't
depend on it -- in a single-session Streamlit script this barely mattered, but in a FastAPI
process serving concurrent users an uncaught exception here is a much bigger blast radius.
Everything else is unchanged business logic.
"""
import logging

import pandas as pd

from app.core.forecasting_core import CHAMPIONS, DIMENSIONS_WITH_BACKTEST, DIMENSIONAL_CHAMPIONS, METRIC_LABELS, answer_question, apply_display_names, resample_yearly, resolve_display_names
from app.core.llm_client import LLMError, parse_intent, parse_query, phrase_answer
from app.models.ask import AskResponse, LlmCallLog, MetricResult, ParsedParams
from app.models.common import ChartPoint
from app.services.explain_service import answer_explain

logger = logging.getLogger("app.ask_service")


def _series_to_chart_points(series: pd.Series) -> list[ChartPoint]:
    tail = series.tail(24).dropna()
    return [ChartPoint(date=idx.date(), value=float(v)) for idx, v in tail.items()]


def _pair_llm_calls(page_log: list[str]) -> list[LlmCallLog]:
    """Groups the flat log into (inputs, output) pairs -- every LLM call logs its exact
    messages as "LLM INPUT (role): ..." lines immediately followed by one
    "LLM OUTPUT (raw): ..." line, so a call boundary is just "buffer inputs until the next
    output line." Mirrors app.py lines 325-335 exactly."""
    calls: list[LlmCallLog] = []
    pending: list[str] = []
    for line in page_log:
        if line.startswith("LLM INPUT"):
            pending.append(line)
        elif line.startswith("LLM OUTPUT"):
            output = line
            if output.startswith("LLM OUTPUT (raw): "):
                output = output[len("LLM OUTPUT (raw): "):]
            calls.append(LlmCallLog(inputs=pending, output=output))
            pending = []
    return calls


def answer(question: str) -> AskResponse:
    page_log: list[str] = []

    def log(msg: str) -> None:
        logger.info(msg)
        page_log.append(msg)

    log(f"question = {question!r}")

    # The UI shows client-facing display names (e.g. "Vancouver Branch") that don't exist in
    # the real data -- parse_query/parse_intent's vocabulary is still the real DIMENSION_VALUES
    # ("Medical Branch 02"), so a question phrased the way the UI now looks needs this
    # translation to resolve at all. Only the copy handed to the parser changes; `question`
    # itself (logged above, and later passed to phrase_answer/phrase_decline_explanation for
    # narration) stays exactly what was typed or clicked.
    resolved_question = resolve_display_names(question)
    if resolved_question != question:
        log(f"display names resolved -> {resolved_question!r}")

    try:
        parsed = parse_query(resolved_question, log_fn=log)
        parse_note = None
        log(f"parsed -> {parsed}")
    except LLMError as e:
        parsed = {"horizon": "month", "explicit_year": None, "explicit_month": None,
                   "dimension": None, "dimension_value": None, "metrics": ["net_sales"]}
        parse_note = str(e)
        log(f"LLM parse FAILED ({e}) -> defaulted to whole-business net_sales/month")

    if parse_note is None:
        # Only attempted when the main parse succeeded -- if the API is already failing,
        # a second call would just fail the same way, so fall through to the existing
        # defensive default below instead of trying it twice.
        try:
            intent = parse_intent(resolved_question, log_fn=log)
            log(f"intent -> {intent}")
        except LLMError as e:
            intent = "value"
            log(f"intent parse FAILED ({e}) -> defaulting to the value path")
        if intent == "explain":
            return answer_explain(question, parsed, page_log, log)

    horizon = parsed["horizon"]
    target_year = parsed["explicit_year"]
    target_month = parsed["explicit_month"]
    dimension = parsed["dimension"]
    dimension_value = parsed["dimension_value"]
    metrics = parsed["metrics"]

    parsed_params = ParsedParams(
        horizon=horizon, explicit_year=target_year, explicit_month=target_month,
        dimension=dimension, dimension_value=dimension_value, metrics=metrics,
    )

    # A dimension type was recognized but no single real value -- either a generic/ranking
    # question or a name that doesn't match anything real. Answering at the whole-business
    # level instead (silently, as if no dimension were mentioned) would be answering a
    # different question than the one asked -- refused explicitly instead. Mirrors app.py
    # lines 164-183.
    if dimension and not dimension_value:
        log(f"dimension={dimension!r} recognized but no specific, real value matched -> "
            f"can't answer a ranking/generic/unrecognized-name question this way, refusing")
        return AskResponse(
            status="dimension_refused",
            parsed=parsed_params,
            parse_note=parse_note,
            log=page_log,
            refused_dimension=dimension,
        )

    log(f"metrics -> {metrics}" +
        (f"  |  dimension -> {dimension}={dimension_value!r}" if dimension_value else "  |  whole-business (no dimension)"))

    metric_results: list[MetricResult] = []
    for m in metrics:
        label = METRIC_LABELS.get(m, m)
        try:
            result = answer_question(horizon, target_year=target_year, target_month=target_month,
                                      metric=m, dimension=dimension, dimension_value=dimension_value)
        except LLMError as e:
            # New hardening, not existing app.py behavior: answer_question() itself has no
            # try/except in app.py today, so this exact failure would currently crash the
            # whole request if the champion for this metric/horizon happens to be
            # claude-haiku-4-5 and the Anthropic API has a hiccup. Isolating it per-metric
            # here means the other metrics in a multi-metric question still answer.
            log(f"answer_question FAILED for {m} ({e}) -> marking this metric failed, "
                f"continuing with the rest of the question")
            metric_results.append(MetricResult(metric=m, status="failed", error_message=str(e), chart_data=[]))
            continue

        page_log.extend(result.get("log", []))

        if result.get("out_of_range"):
            if result.get("champion_too_unreliable"):
                refusal_reason = "champion_too_unreliable"
                log(f"REFUSING {m} for {dimension}={dimension_value} -- a champion exists but its "
                    f"own backtested error exceeds the reliability floor (see log above for the "
                    f"exact measured error)")
            elif result.get("unvalidated_dimension"):
                refusal_reason = "unvalidated_dimension"
                validated_dims = sorted(DIMENSIONAL_CHAMPIONS.keys())
                log(f"REFUSING {m} for {dimension}={dimension_value} -- no validated backtest for "
                    f"this dimension/metric combo (dimensions covered: {validated_dims}, net_sales only)")
            elif result.get("dimension_forecast_out_of_range"):
                refusal_reason = "dimension_forecast_out_of_range"
                log(f"REFUSING {m} for {dimension}={dimension_value} -- forecast requested beyond "
                    f"next month, the validated horizon for dimension-level forecasts")
            else:
                refusal_reason = "unvalidated_metric"
                validated_metrics = sorted(CHAMPIONS.keys())
                log(f"REFUSING {m} -- no backtest at all for this metric at {horizon} level "
                    f"(validated metrics: {validated_metrics})")
            metric_results.append(MetricResult(
                metric=m, status="refused", refusal_reason=refusal_reason,
                period_label=apply_display_names(result.get("period_label")), chart_data=[],
            ))
            continue

        predicted_value = result["predicted_value"]
        model_name = result["model_name"]
        reason = result["reason"]
        series = result["series"]
        is_actual = result["is_actual"]
        period_label = result["period_label"]

        # Year-horizon results carry "years_ahead", month-horizon carry "months_ahead" --
        # normalize to one (periods_ahead, unit) pair. The years_ahead/months_ahead handling
        # is copied exactly from the original app.py logic; "weeks_ahead" is new, added
        # alongside it the same way, for the new dimensional-weekly forecast path.
        if "weeks_ahead" in result:
            periods_ahead, period_unit = result["weeks_ahead"], "week"
        elif "months_ahead" in result:
            periods_ahead, period_unit = result["months_ahead"], "month"
        else:
            periods_ahead, period_unit = result.get("years_ahead", 1), "year"
        confidence_level = result.get("confidence_level", "high")
        confidence_reason = result.get("confidence_reason", "")
        range_low, range_high = result.get("range_low"), result.get("range_high")
        error_pct = result.get("error_pct")
        log(f"{m}: value={predicted_value:,.1f} {period_unit}s_ahead={periods_ahead} "
            f"confidence={confidence_level} range=({range_low},{range_high})")

        try:
            answer_text = phrase_answer(question, horizon, model_name, predicted_value, reason,
                                         period_label=period_label, is_actual=is_actual,
                                         metric_label=label, dimension=dimension,
                                         dimension_value=dimension_value, log_fn=log)
            log(f"LLM phrased {m}, verified the figure {predicted_value:,.0f} appears in it")
        except LLMError as e:
            tag = "Actual" if is_actual else "Projected"
            answer_text = (
                f"{tag} {label} for {period_label}: **{predicted_value:,.0f}**"
                + ("" if is_actual else f" (method: {model_name})")
                + f" *(LLM phrasing unavailable: {e})*"
            )
            log(f"LLM phrasing unavailable for {m} ({e}) -> showed the raw number instead")

        metric_results.append(MetricResult(
            metric=m, status="ok",
            predicted_value=predicted_value, model_name=model_name, error_pct=error_pct,
            reason=apply_display_names(reason),
            # period_label was computed and used locally (phrase_answer, the fallback string)
            # but never made it into the response -- a migration regression: the frontend
            # renders it both in the "already fully in the data" actual banner and in "Period
            # this answers", so every successful answer had two blank spots in the UI.
            # apply_display_names here too -- it's built from the real internal dimension_value
            # ("Medical Branch 01"), and unlike answer_text/reason it was never passed through
            # the cosmetic name-mapping layer before reaching the client.
            period_label=apply_display_names(period_label),
            is_actual=is_actual, periods_ahead=periods_ahead, period_unit=period_unit,
            confidence_level=confidence_level, confidence_reason=confidence_reason,
            range_low=range_low, range_high=range_high, answer_text=apply_display_names(answer_text),
            # predicted_value/period_label for a year-horizon result is a full-YEAR total --
            # charting it against raw monthly history points would plot one point ~12x the
            # scale of every other, reading as a spike instead of a trend. Resample the history
            # to yearly totals first so every point on this chart is the same unit.
            chart_data=_series_to_chart_points(resample_yearly(series) if horizon == "year" else series),
        ))

    return AskResponse(
        status="answered",
        parsed=parsed_params,
        parse_note=parse_note,
        log=page_log,
        metric_results=metric_results,
        llm_calls=_pair_llm_calls(page_log),
    )
