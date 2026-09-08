"""Response shapes for GET /api/backtests -- the already-measured offline backtest results,
read straight off the champions*.json files the score_*.py scripts wrote. Nothing here is
recomputed or estimated: every number was produced by a real 2021-2024 -> 2025 holdout run.

Two statistics coexist deliberately and are never mixed:
  - "mape"     (week/month grain) -- mean absolute percentage error across every period
  - "diff_pct" (year grain)       -- signed % difference on the full-year total
A year figure is NOT a MAPE and averaging the two together would be meaningless, so each
table carries a `statistic` field naming which one it holds.
"""
from typing import Literal, Optional

from pydantic import BaseModel

Grain = Literal["week", "month", "year"]
Statistic = Literal["mape", "diff_pct"]


class ModelScore(BaseModel):
    model: str
    reason: str
    # mape/mae for week+month grain; diff_pct/predicted for year grain. The unused pair is None
    # rather than zero -- absent, not measured-as-zero.
    mape: Optional[float] = None
    mae: Optional[float] = None
    diff_pct: Optional[float] = None
    predicted: Optional[float] = None
    is_champion: bool = False
    # abs(diff_pct) for year, mape otherwise -- the single comparable number for sorting and
    # for "how far off was it", so a client doesn't have to branch on statistic to rank rows.
    error_pct: Optional[float] = None


class WholeBusinessBacktest(BaseModel):
    """One (metric, grain) contest across all six candidates, whole business."""
    metric: str
    metric_label: str
    grain: Grain
    statistic: Statistic
    champion: str
    actual: Optional[float] = None  # year grain only -- the real recorded total
    scores: list[ModelScore]        # best-first


class DimensionBacktest(BaseModel):
    """One (dimension, grain) contest aggregated across every value of that dimension --
    e.g. all 15 branches at monthly grain. per_model_avg is the mean of that model's own score
    across the values; champion_avg is the mean of each value's OWN winner, which is always
    better than any single model's column because the winner is chosen per value after seeing
    the scores (a best-of-six selection effect, not a sixth model that beats the other five)."""
    dimension: str
    grain: Grain
    statistic: Statistic
    values_tested: int
    champion_avg: float
    per_model_avg: dict[str, float]
    champion_wins: dict[str, int]


class ActualVsPredicted(BaseModel):
    """One real held-back comparison: what the champion predicted for 2025 vs what 2025
    actually turned out to be, for one scope."""
    scope: str
    dimension: Optional[str] = None
    dimension_value: Optional[str] = None
    target_year: int
    actual: float
    predicted: float
    champion: str
    error_pct: float  # signed: negative = over-forecast, positive = under-forecast


class BacktestsResponse(BaseModel):
    train_period: str
    test_period: str
    candidates: list[str]
    reasons: dict[str, str]
    reliability_floor_pct: int
    whole_business: list[WholeBusinessBacktest]
    dimensional: list[DimensionBacktest]
    actual_vs_predicted: list[ActualVsPredicted]
    # How many (dimension, value) pairs earned a validated champion at each grain, and how many
    # of those the reliability floor still rejects as too inaccurate to answer with.
    coverage: dict[str, int]
