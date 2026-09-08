"""Structured-form validation for the Model Playground's free-text year/month fields --
moved verbatim from app.py (where it lived despite having zero Streamlit coupling). Plain
integer/month-name parsing is exactly the kind of thing regex is the right tool for; this is
not the "no hardcoded regex" free-text-understanding concern that governs llm_client.py --
these are single-purpose structured fields, not open-ended natural language.
"""
import re

MONTH_LOOKUP = {  # every spelling a plain-text "Month" field should accept
    "january": 1, "jan": 1, "1": 1, "01": 1,
    "february": 2, "feb": 2, "2": 2, "02": 2,
    "march": 3, "mar": 3, "3": 3, "03": 3,
    "april": 4, "apr": 4, "4": 4, "04": 4,
    "may": 5, "5": 5, "05": 5,
    "june": 6, "jun": 6, "6": 6, "06": 6,
    "july": 7, "jul": 7, "7": 7, "07": 7,
    "august": 8, "aug": 8, "8": 8, "08": 8,
    "september": 9, "sep": 9, "sept": 9, "9": 9, "09": 9,
    "october": 10, "oct": 10, "10": 10,
    "november": 11, "nov": 11, "11": 11,
    "december": 12, "dec": 12, "12": 12,
}


def parse_single_int_field(raw, field_name, min_val, max_val):
    """Returns (value, error): value is None with no error for a blank field; value is None
    with an error message for anything malformed -- multiple values, non-numeric text, or out
    of range -- so the caller can show that message and refuse to run rather than guessing
    which one was meant."""
    raw = (raw or "").strip()
    if not raw:
        return None, None
    tokens = [t for t in re.split(r"[,\s/;]+", raw) if t]
    if len(tokens) > 1:
        return None, f"Enter exactly one {field_name}, not multiple ({raw!r})."
    if not re.fullmatch(r"-?\d+", tokens[0]):
        return None, f"{raw!r} isn't a whole number -- {field_name} must be a single integer."
    value = int(tokens[0])
    if value < min_val or value > max_val:
        return None, f"{value} is out of range for {field_name} (expected {min_val}-{max_val})."
    return value, None


def parse_single_month_field(raw):
    """Same principle as parse_single_int_field, for a month typed as a name or number."""
    raw = (raw or "").strip()
    if not raw:
        return None, None
    tokens = [t for t in re.split(r"[,\s/;]+", raw) if t]
    if len(tokens) > 1:
        return None, f"Enter exactly one month, not multiple ({raw!r})."
    month = MONTH_LOOKUP.get(tokens[0].lower())
    if month is None:
        return None, f"{raw!r} isn't a recognized month (a name like \"March\" or a number 1-12)."
    return month, None
