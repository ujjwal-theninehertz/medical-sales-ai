"""GET /api/dashboard/summary -- KPI row data for the dashboard. A GET with query params,
not a POST, since this has no side effects and is purely a read -- matches REST convention
better than the POST-with-body pattern /api/ask and /api/playground/run use (those take a
free-text question / a larger structured request; this just takes a few scalar filters)."""
import logging

from fastapi import APIRouter, Query

from app.core.forecasting_core import compute_scope_matrix, load_series
from app.models.dashboard import DashboardSummary, ScopeMatrix
from app.models.decline import DeclineExplanation
from app.services.dashboard_service import get_dashboard_summary
from app.services.insights_service import get_dashboard_insights

logger = logging.getLogger("app.api.dashboard")
router = APIRouter()


@router.get("/api/dashboard/summary", response_model=DashboardSummary)
def dashboard_summary(
    metric: str = Query("net_sales"),
    dimension: str | None = Query(None),
    dimension_value: str | None = Query(None),
    grain: str = Query("year"),
    year: int | None = Query(None),
):
    logger.info(f"dashboard summary request: metric={metric!r} dimension={dimension!r} "
                f"value={dimension_value!r} grain={grain!r} year={year!r}")
    return get_dashboard_summary(metric, dimension, dimension_value or None, grain, year)


@router.get("/api/dashboard/scopes", response_model=ScopeMatrix)
def dashboard_scopes(
    metric: str = Query("net_sales"),
    grain: str = Query("month"),
    dimension: str = Query("branch"),
):
    logger.info(f"scope matrix request: metric={metric!r} grain={grain!r} dimension={dimension!r}")
    return compute_scope_matrix(metric=metric, grain=grain, dimension=dimension)


@router.get("/api/dashboard/insights", response_model=DeclineExplanation)
def dashboard_insights(
    metric: str = Query("net_sales"),
    dimension: str | None = Query(None),
    dimension_value: str | None = Query(None),
    year: int | None = Query(None),
):
    resolved_year = year or int(load_series("MS", "net_sales").index.max().year)
    logger.info(f"dashboard insights request: metric={metric!r} dimension={dimension!r} "
                f"value={dimension_value!r} year={resolved_year!r}")
    return get_dashboard_insights(metric, dimension, dimension_value or None, resolved_year)
