"""Orchestration for GET /api/dashboard/insights -- the AI Insights panel, driven directly by
the dashboard's filter bar rather than a typed question. Reuses the exact same engine
explain_service.answer_explain() uses for the conversational "why" flow
(forecasting_core.explain_decline -> llm_client.phrase_decline_explanation ->
llm_client.generate_recommendation) -- the only difference is that this skips intent
classification and natural-language date/dimension parsing entirely, since the dashboard
already has metric/dimension/dimension_value/year as structured filter values, not free text.
"""
import logging

from app.core.forecasting_core import METRIC_LABELS, explain_decline
from app.core.llm_client import (
    LLMError,
    decline_fallback_text,
    generate_recommendation,
    phrase_decline_explanation,
    recommendation_fallback,
    scope_label,
)
from app.models.decline import DeclineExplanation

logger = logging.getLogger("app.insights_service")


def get_dashboard_insights(metric: str, dimension: str | None, dimension_value: str | None,
                            year: int) -> DeclineExplanation:
    log_lines: list[str] = []
    log = log_lines.append

    explanation = explain_decline(metric=metric, target_year=year, dimension=dimension,
                                   dimension_value=dimension_value, log_fn=log)

    # A real, honestly-labeled question describing exactly what was computed -- not typed by
    # anyone, but true, and phrase_decline_explanation's prompt expects a "question as asked"
    # line for context either way.
    metric_label = METRIC_LABELS.get(metric, metric)
    scope = scope_label(dimension, dimension_value)
    question = f"why did {metric_label} change in {year}, for {scope}"

    try:
        answer_text = phrase_decline_explanation(question, explanation, log_fn=log)
    except LLMError as e:
        log(f"LLM phrasing unavailable for dashboard insights ({e}) -> using computed numbers only")
        answer_text = decline_fallback_text(explanation)

    try:
        recommendation = generate_recommendation(explanation, log_fn=log)
    except LLMError as e:
        log(f"LLM recommendation unavailable for dashboard insights ({e}) -> using computed fallback")
        recommendation = recommendation_fallback(explanation)

    return DeclineExplanation(**explanation, answer_text=answer_text, recommendation=recommendation)
