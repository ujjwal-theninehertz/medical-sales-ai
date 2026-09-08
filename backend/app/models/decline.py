from typing import Literal, Optional

from pydantic import BaseModel


class DeclineBreakdownRow(BaseModel):
    """One dimension value's target/comparison totals -- one row of a level's full ranked
    breakdown (DeclineLevel.all_values)."""
    value: str
    target: float
    comparison: float
    delta: float
    delta_pct: Optional[float] = None


class DeclineTotal(BaseModel):
    target: float
    comparison: float
    delta: float
    delta_pct: Optional[float] = None


class DeclineLevel(BaseModel):
    dimension: str
    value: str
    target: float
    comparison: float
    delta: float
    delta_pct: Optional[float] = None
    share_of_parent_decline_pct: float
    concentrated: bool
    offset_note: Optional[str] = None
    all_values: list[DeclineBreakdownRow] = []


class DeclineDriverFactor(BaseModel):
    # target/comparison are Optional -- avg_price is undefined (None), not zero, whenever
    # that period had zero quantity (nothing sold, so there's no real average price to report).
    # Caught live: "why did Route 05 sales decline" reached a product with zero comparison-
    # period quantity once growth-drilling started reaching this deep -- 500 error, since this
    # was required=float before.
    target: Optional[float] = None
    comparison: Optional[float] = None
    delta_pct: Optional[float] = None


class DeclineDriver(BaseModel):
    quantity: DeclineDriverFactor
    avg_price: DeclineDriverFactor
    distinct_customers: DeclineDriverFactor
    primary_driver: Optional[Literal["quantity", "avg_price", "distinct_customers"]] = None


class DeclineTreeNode(BaseModel):
    """One fanned-out branch of the top-N drill-down tree (see forecasting_core.
    _decline_tree_branch) -- unlike `levels` on DeclineExplanation (the single deepest path,
    narrated into answer_text/recommendation), this carries the top DECLINE_TOP_N movers at
    EVERY fork, nested arbitrarily deep, so the UI can show top-3 branches, each with their own
    top-3 categories, each with their own top-3 products, all at once."""
    dimension: str
    value: str
    target: float
    comparison: float
    delta: float
    delta_pct: Optional[float] = None
    share_of_parent_decline_pct: float
    concentrated: bool
    offset_note: Optional[str] = None
    all_values: list[DeclineBreakdownRow] = []
    stopped_reason: Optional[str] = None
    driver: Optional[DeclineDriver] = None
    children: list["DeclineTreeNode"] = []


DeclineTreeNode.model_rebuild()


class DeclineExplanation(BaseModel):
    metric: str
    metric_label: str
    target_year: int
    comparison_year: int
    scope_dimension: Optional[str] = None
    scope_value: Optional[str] = None
    total: DeclineTotal
    direction: Literal["decrease", "increase", "flat"]
    levels: list[DeclineLevel] = []
    stopped_reason: Optional[str] = None
    horizon_note: Optional[str] = None
    driver: Optional[DeclineDriver] = None
    tree: list[DeclineTreeNode] = []
    answer_text: str
    recommendation: Optional[str] = None
