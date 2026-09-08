"""Orchestration for the "why did X change" path of POST /api/ask -- a completely different
computation from ask_service.answer_question()'s single-number lookup/forecast. This computes
a real, verified branch -> category -> product drill-down (forecasting_core.explain_decline())
and only then narrates it (llm_client.phrase_decline_explanation()). The LLM never sees the raw
transaction database at any point -- only the already-computed, already-real numbers.

Unlike the forecast path, explain_decline() needs no backtest/champion validation at all --
it's a direct historical computation (this year vs a prior year), so it works for every
dimension type (including route/supplier, which the forecast path can't reach beyond "next
month") and isn't gated by DIMENSIONS_WITH_BACKTEST or the reliability floor in any way.
"""
import logging

from app.core.forecasting_core import apply_display_names, explain_decline
from app.core.llm_client import (
    LLMError,
    recommendation_fallback,
    decline_fallback_text,
    generate_recommendation,
    phrase_decline_explanation,
)
from app.models.ask import AskResponse, ParsedParams
from app.models.decline import DeclineExplanation

logger = logging.getLogger("app.explain_service")


def answer_explain(question: str, parsed: dict, page_log: list[str], log) -> AskResponse:
    parsed_params = ParsedParams(
        horizon=parsed["horizon"], explicit_year=parsed["explicit_year"], explicit_month=parsed["explicit_month"],
        dimension=parsed["dimension"], dimension_value=parsed["dimension_value"], metrics=parsed["metrics"],
    )
    metric = parsed["metrics"][0]  # explain questions are always about one metric at a time

    # No explicit year given ("why did sales decrease" with no year) -> the most recent fully
    # recorded year, same "resolve against the real data's own end date" principle used
    # everywhere else in this app (never guessed by the LLM, which has no notion of today's date).
    target_year = parsed["explicit_year"]
    if target_year is None:
        from app.core.forecasting_core import load_series
        target_year = load_series("MS", metric).index.max().year
        log(f"no explicit year in the question -> defaulting target_year to the latest recorded year, {target_year}")

    dimension, dimension_value = parsed["dimension"], parsed["dimension_value"]
    if dimension and not dimension_value:
        # Same refusal the value path uses for a recognized-but-unresolved dimension (generic
        # "which branch", a typo, a name not in the real list) -- explain_decline has nothing
        # real to scope to either.
        log(f"dimension={dimension!r} recognized but no specific, real value matched -> "
            f"can't scope the explanation this way, refusing")
        return AskResponse(status="dimension_refused", parsed=parsed_params, log=page_log,
                            refused_dimension=dimension)

    # explain_decline only ever compares full calendar years -- there's no month-over-month or
    # week-over-week version of this built. A question phrased at month/week grain ("why did
    # sales decrease this month") would otherwise silently get a year-over-year answer narrated
    # as if it addressed "this month", which is a real mismatch between what was asked and what
    # was computed. Surfacing it as explicit context is cheap; silently mislabeling the
    # comparison is exactly the kind of thing this whole app refuses to do everywhere else.
    horizon_note = None
    if parsed["horizon"] != "year":
        horizon_note = (f"the question was phrased at {parsed['horizon']} grain, but only "
                         f"full-year, year-over-year comparison is available today -- state "
                         f"plainly that this compares {target_year} to {target_year - 1} as "
                         f"whole years, not {parsed['horizon']}s")
        log(f"question horizon={parsed['horizon']!r} but explain_decline only supports year-over-year "
            f"-> noting the scope mismatch honestly rather than mislabeling the comparison")

    try:
        explanation = explain_decline(metric=metric, target_year=target_year,
                                       dimension=dimension, dimension_value=dimension_value, log_fn=log)
        if horizon_note:
            explanation["horizon_note"] = horizon_note
    except Exception as e:
        logger.exception("explain_decline failed")
        log(f"explain_decline FAILED ({type(e).__name__}: {e})")
        return AskResponse(status="decline_failed", parsed=parsed_params, log=page_log,
                            decline_error=str(e))

    try:
        answer_text = phrase_decline_explanation(question, explanation, log_fn=log)
        log("LLM phrased the decline explanation, verified its figures appear in it")
    except LLMError as e:
        log(f"LLM phrasing unavailable for the decline explanation ({e}) -> using computed numbers only")
        answer_text = decline_fallback_text(explanation)

    try:
        recommendation = generate_recommendation(explanation, log_fn=log)
        log("LLM generated a recommendation, grounded in the real finding")
    except LLMError as e:
        log(f"LLM recommendation unavailable ({e}) -> using computed fallback template")
        recommendation = recommendation_fallback(explanation)

    return AskResponse(
        status="decline_explained", parsed=parsed_params, log=page_log,
        decline=DeclineExplanation(
            **explanation,
            answer_text=apply_display_names(answer_text),
            recommendation=apply_display_names(recommendation),
        ),
    )
