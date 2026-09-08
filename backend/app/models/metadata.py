from typing import Optional

from pydantic import BaseModel


class ChampionInfo(BaseModel):
    model: str
    reason: str
    # The champion's own measured backtest error for this exact scope. Present for dimensional
    # champions (the loaders compute it); absent for whole-business ones, where the figure is
    # already embedded in `reason`. Declared here because Pydantic silently drops undeclared
    # keys -- without this the numeric error never left the backend, only its prose mention.
    error_pct: Optional[float] = None


class DatasetColumn(BaseModel):
    name: str
    label: str
    description: str
    group: str


class DatasetOverview(BaseModel):
    total_rows: int
    total_columns: int
    date_start: str
    date_end: str
    years_covered: int
    columns: list[DatasetColumn]
    counts: dict[str, int]
    categorical_fields: dict[str, list[str]]
    total_net_sales: float


class MetadataResponse(BaseModel):
    dimension_values: dict[str, list[str]]
    metric_labels: dict[str, str]
    playground_metric_labels: dict[str, str]
    playground_dimensions: list[str]
    reasons: dict[str, str]
    all_models: list[str]
    dimensions_with_backtest: list[str]
    champions: dict[str, dict[str, ChampionInfo]]
    dimensional_champions: dict[str, dict[str, ChampionInfo]]
    # Same shape as dimensional_champions (dimension -> value -> champion), at the other two
    # grains -- already computed and held in memory by forecasting_core, just not previously
    # surfaced. Lets the frontend show a real per-scope, per-grain champion lookup instead of
    # only ever describing the monthly one.
    dimensional_champions_week: dict[str, dict[str, ChampionInfo]]
    dimensional_champions_year: dict[str, dict[str, ChampionInfo]]
    sample_questions: list[str]
    dataset_overview: DatasetOverview
