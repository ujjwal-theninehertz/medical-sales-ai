"""GET /api/dataset-export -- the full raw dataset as a downloadable CSV, with
stock_branch/route/supplier/product swapped for their client-facing display names. Mirrors
what the rest of the app shows on screen, so a client opening this file sees the same names
as the UI rather than the internal "Medical Branch 01" style identifiers.
"""
from fastapi import APIRouter
from fastapi.responses import Response

from app.core import forecasting_core as fc

router = APIRouter()


@router.get("/api/dataset-export")
def dataset_export():
    return Response(
        content=fc.DISPLAY_EXPORT_CSV,
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="medical_sales_data.csv"'},
    )
