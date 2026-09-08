"""Orchestration for GET /api/backtests -- turns the champions*.json files the offline
score_*.py scripts wrote into the comparison tables a "how were these models chosen" view
needs. Pure aggregation over data already loaded at import by forecasting_core: no model runs,
no LLM calls, no recomputation. Every figure traces back to one real 2021-2024 -> 2025 holdout.

The score files already contain every candidate's score, not just the winner's -- the champion
loaders in forecasting_core reduce them to the winner for answering questions, and this reads
the same files' full tables instead.
"""
import logging

from app.core.forecasting_core import (
    ALL_MODELS,
    CHAMPIONS,
    DIMENSIONAL_CHAMPIONS,
    DIMENSIONAL_MAX_RELIABLE_ERROR_PCT,
    DIMENSIONAL_WEEKLY_CHAMPIONS,
    DIMENSIONAL_YEARLY_CHAMPIONS,
    FULL_RESULTS_DIMENSIONAL,
    FULL_RESULTS_WHOLE,
    METRIC_LABELS,
    RAW_SCORES_WEEKLY,
    RAW_SCORES_YEARLY,
    REASONS,
)
from app.models.backtests import (
    ActualVsPredicted,
    BacktestsResponse,
    DimensionBacktest,
    ModelScore,
    WholeBusinessBacktest,
)

logger = logging.getLogger("app.backtest_service")

# The LLM candidate is absent from ALL_MODELS on purpose (it stays out of the live Playground
# for cost reasons) but it DID compete in every offline backtest, so a "models tested" view
# must include it or it misrepresents how the champions were actually chosen.
LLM_CANDIDATE = "claude-haiku-4-5"
CANDIDATES = [*ALL_MODELS, LLM_CANDIDATE]

TRAIN_PERIOD = "2021-2024"
TEST_PERIOD = "2025"

# How many real per-branch/per-category examples to surface on an actual-vs-predicted view.
# Deliberately capped: the point is a few verifiable examples a client can check, not 302 rows.
_AVP_SAMPLE_PER_DIMENSION = 4
_AVP_DIMENSIONS = ["branch", "category", "customer_type"]


def _whole_business_tables() -> list[WholeBusinessBacktest]:
    out: list[WholeBusinessBacktest] = []
    for metric, by_grain in FULL_RESULTS_WHOLE.items():
        for grain, per_model in by_grain.items():
            champion = CHAMPIONS.get(metric, {}).get(grain, {}).get("model")
            statistic = "diff_pct" if grain == "year" else "mape"
            actual = per_model.get("actual") if grain == "year" else None

            scores: list[ModelScore] = []
            for model, info in per_model.items():
                if model == "actual":  # a scalar sibling key in the year block, not a model
                    continue
                if statistic == "mape":
                    error = info.get("mape")
                    score = ModelScore(model=model, reason=REASONS.get(model, ""),
                                        mape=info.get("mape"), mae=info.get("mae"),
                                        is_champion=model == champion, error_pct=error)
                else:
                    diff = info.get("diff_pct")
                    score = ModelScore(model=model, reason=REASONS.get(model, ""),
                                        diff_pct=diff, predicted=info.get("predicted"),
                                        is_champion=model == champion,
                                        error_pct=abs(diff) if diff is not None else None)
                scores.append(score)

            scores.sort(key=lambda s: (s.error_pct is None, s.error_pct))
            out.append(WholeBusinessBacktest(
                metric=metric, metric_label=METRIC_LABELS.get(metric, metric), grain=grain,
                statistic=statistic, champion=champion or "", actual=actual, scores=scores,
            ))
    # week -> month -> year within each metric, so the table reads shortest horizon first
    order = {"week": 0, "month": 1, "year": 2}
    out.sort(key=lambda t: (t.metric, order.get(t.grain, 9)))
    return out


def _dimension_tables(raw: dict, grain: str) -> list[DimensionBacktest]:
    """raw is one champions_dimensional_*.json: {dimension: {value: {...}}}. Monthly/weekly
    entries carry scores{model: mape}; yearly entries carry diff_pct{model} instead, whose
    absolute value is the comparable error."""
    statistic = "diff_pct" if grain == "year" else "mape"
    out: list[DimensionBacktest] = []

    for dimension, values in raw.items():
        totals: dict[str, list[float]] = {m: [] for m in CANDIDATES}
        wins: dict[str, int] = {}
        champion_scores: list[float] = []

        for info in values.values():
            per_model = info["diff_pct"] if statistic == "diff_pct" else info["scores"]
            champion = info["champion"]
            for model, raw_score in per_model.items():
                score = abs(raw_score) if statistic == "diff_pct" else raw_score
                totals.setdefault(model, []).append(score)
            if champion in per_model:
                champ_score = per_model[champion]
                champion_scores.append(abs(champ_score) if statistic == "diff_pct" else champ_score)
            wins[champion] = wins.get(champion, 0) + 1

        if not champion_scores:
            continue
        out.append(DimensionBacktest(
            dimension=dimension, grain=grain, statistic=statistic, values_tested=len(values),
            champion_avg=round(sum(champion_scores) / len(champion_scores), 1),
            per_model_avg={m: round(sum(v) / len(v), 1) for m, v in totals.items() if v},
            champion_wins=dict(sorted(wins.items(), key=lambda kv: -kv[1])),
        ))

    out.sort(key=lambda t: t.champion_avg)
    return out


def _actual_vs_predicted() -> list[ActualVsPredicted]:
    """Real 2025 holdout comparisons. The whole-business row comes from champions_medical.json's
    year block; the per-dimension rows from champions_dimensional_yearly.json, which is the one
    file that persisted each candidate's actual predicted VALUE (not just its error), so a real
    actual-vs-predicted pair can be shown rather than reconstructed."""
    out: list[ActualVsPredicted] = []
    target_year = int(TEST_PERIOD)

    for metric, by_grain in FULL_RESULTS_WHOLE.items():
        year_block = by_grain.get("year") or {}
        actual = year_block.get("actual")
        champion = CHAMPIONS.get(metric, {}).get("year", {}).get("model")
        if actual is None or not champion or champion not in year_block:
            continue
        info = year_block[champion]
        out.append(ActualVsPredicted(
            scope=f"Whole business — {METRIC_LABELS.get(metric, metric)}",
            target_year=target_year, actual=actual, predicted=info["predicted"],
            champion=champion, error_pct=info["diff_pct"],
        ))

    for dimension in _AVP_DIMENSIONS:
        values = RAW_SCORES_YEARLY.get(dimension, {})
        # Biggest scopes first -- a client recognises the large branches, and thin scopes are
        # exactly where any single example is least representative.
        ranked = sorted(values.items(), key=lambda kv: -(kv[1].get("actual") or 0))
        for value, info in ranked[:_AVP_SAMPLE_PER_DIMENSION]:
            champion = info["champion"]
            if champion not in info.get("predicted", {}):
                continue
            out.append(ActualVsPredicted(
                scope=f"{dimension} = {value}", dimension=dimension, dimension_value=value,
                target_year=target_year, actual=info["actual"],
                predicted=info["predicted"][champion], champion=champion,
                error_pct=info["diff_pct"][champion],
            ))
    return out


def _coverage() -> dict[str, int]:
    def _too_unreliable(table: dict) -> int:
        return sum(1 for values in table.values() for v in values.values()
                    if v.get("error_pct", 0) > DIMENSIONAL_MAX_RELIABLE_ERROR_PCT)

    return {
        "dimensional_values_month": sum(len(v) for v in DIMENSIONAL_CHAMPIONS.values()),
        "dimensional_values_week": sum(len(v) for v in DIMENSIONAL_WEEKLY_CHAMPIONS.values()),
        "dimensional_values_year": sum(len(v) for v in DIMENSIONAL_YEARLY_CHAMPIONS.values()),
        "rejected_by_reliability_floor_month": _too_unreliable(DIMENSIONAL_CHAMPIONS),
        "rejected_by_reliability_floor_week": _too_unreliable(DIMENSIONAL_WEEKLY_CHAMPIONS),
        "rejected_by_reliability_floor_year": _too_unreliable(DIMENSIONAL_YEARLY_CHAMPIONS),
        "dimensions_backtested": len(DIMENSIONAL_CHAMPIONS),
        "candidates_per_contest": len(CANDIDATES),
    }


def get_backtests() -> BacktestsResponse:
    dimensional = [
        *_dimension_tables(FULL_RESULTS_DIMENSIONAL, "month"),
        *_dimension_tables(RAW_SCORES_WEEKLY, "week"),
        *_dimension_tables(RAW_SCORES_YEARLY, "year"),
    ]
    logger.info(f"backtests: {len(dimensional)} dimension/grain tables, "
                f"{len(FULL_RESULTS_WHOLE)} whole-business metrics")
    return BacktestsResponse(
        train_period=TRAIN_PERIOD, test_period=TEST_PERIOD, candidates=CANDIDATES,
        reasons=REASONS, reliability_floor_pct=DIMENSIONAL_MAX_RELIABLE_ERROR_PCT,
        whole_business=_whole_business_tables(), dimensional=dimensional,
        actual_vs_predicted=_actual_vs_predicted(), coverage=_coverage(),
    )
