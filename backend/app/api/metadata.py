"""GET /api/metadata -- everything the frontend needs to render the page shell and compose
refusal/detail text client-side, fetched once on load. No LLM calls, no request body.
Mirrors app.py's module-level SAMPLE_QUESTIONS construction (lines 96-114) exactly.
"""
from fastapi import APIRouter

from app.core import forecasting_core as fc
from app.models.metadata import MetadataResponse

router = APIRouter()

# Only "branch" here -- route/category/product_type/customer_type sample questions were tried
# and dropped as clutter (too many near-duplicate "next month" questions). Branch stays because
# it's the clearest single "prediction for a specific real place" example.
_SAMPLE_DIMS = [
    ("branch", "{} sales next month"),
]

# "Why" questions route to the attribution/drill-down engine (explain_decline), which only ever
# compares one named year against the year before it -- it has no "scan every year and report
# which one changed" mode. So unlike _SAMPLE_DIMS above, these are hardcoded to a real, checked
# instance rather than templated off DIMENSION_VALUES[0]: Orthopedic category net_sales actually
# rose 17.1% in 2023 (2022: 17,75,273 -> 2023: 20,79,322) and actually fell 10.6% the very next
# year, 2024 (2023: 20,79,322 -> 2024: 18,59,125) -- the largest real swing, in either direction,
# of any category in the dataset. Verified directly against medical_sales_5yr_250k.csv, not
# guessed -- picking an arbitrary category here could just as easily land on a flat year with
# nothing for explain_decline to say.
_SAMPLE_WHY_QUESTIONS = [
    "Why did Orthopedic category sales increase in 2023?",
    "Why did Orthopedic category sales decrease in 2024?",
]


def _build_sample_questions() -> list[str]:
    questions = [
        "What will next month's revenue be?",
        "What will next year's revenue be?",
        *_SAMPLE_WHY_QUESTIONS,
        # Orthopedic also cleared score_dimensional_yearly.py's backtest (champion: linear_trend,
        # -1.9% diff), so a genuine next-year forecast -- not just the next-month one _SAMPLE_DIMS
        # already covers -- is real and answerable for it too.
        "What will Orthopedic category sales be next year?",
        # Medical Branch 01 ("Toronto Branch") cleared the same yearly backtest too (champion:
        # linear_trend, only 0.3% diff -- one of the best in the whole dimensional set), so a
        # full-year branch-level forecast is real here, not just the next-month one _SAMPLE_DIMS
        # covers. Hardcoded to the display name, same reasoning as the "why" questions above --
        # DIMENSION_VALUES[0] alphabetically isn't necessarily one that cleared this backtest.
        "What is Toronto Branch's sales in 2026?",
    ]
    for dim, template in _SAMPLE_DIMS:
        values = fc.DIMENSION_VALUES.get(dim)
        if values:
            # DIMENSION_VALUES holds the real internal codes ("Medical Branch 01") the model and
            # backtests key on -- never what a sample question should show. DISPLAY_NAMES is the
            # client-facing name ("Toronto Branch") for exactly this value; resolve_display_names()
            # translates it back to the real code once this question is clicked and sent to /api/ask.
            display = fc.DISPLAY_NAMES.get(dim, {}).get(values[0], values[0])
            questions.append(template.format(display))
    return questions


@router.get("/api/metadata", response_model=MetadataResponse)
def get_metadata():
    return MetadataResponse(
        dimension_values=fc.DIMENSION_VALUES,
        metric_labels=fc.METRIC_LABELS,
        playground_metric_labels=fc.PLAYGROUND_METRIC_LABELS,
        # "Whole business" + the 8 real dimension-column keys (incl. "customer", which has no
        # DIMENSION_VALUES entry -- that's deliberate, matching app.py's literal Playground
        # selectbox list, which included "customer" specifically to demonstrate the
        # "no list loaded, anything typed is refused" path).
        playground_dimensions=["Whole business"] + list(fc.DIMENSION_COLUMNS.keys()),
        reasons=fc.REASONS,
        all_models=fc.ALL_MODELS,
        dimensions_with_backtest=sorted(fc.DIMENSIONS_WITH_BACKTEST),
        champions=fc.CHAMPIONS,
        dimensional_champions=fc.DIMENSIONAL_CHAMPIONS,
        dimensional_champions_week=fc.DIMENSIONAL_WEEKLY_CHAMPIONS,
        dimensional_champions_year=fc.DIMENSIONAL_YEARLY_CHAMPIONS,
        sample_questions=_build_sample_questions(),
        dataset_overview=fc.DATASET_OVERVIEW,
    )
