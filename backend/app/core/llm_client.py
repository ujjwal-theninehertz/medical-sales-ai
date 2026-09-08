"""
The LLM's jobs in this pipeline:
  1. parse_query    -- understand the question -> horizon, dimension, metric(s)
  2. llm_predict    -- Stream 2's own forecast candidate, temperature=0 so
                        it's reproducible, ONLY trusted if it wins the same
                        real backtest Stream 1's models had to win
  3. phrase_answer  -- convert the winning number into plain language

It never gets to skip the scoring step -- llm_predict's output goes
through score_whole_business.py exactly like every other candidate.

Every prompt here is built in the same five labelled sections -- ROLE / TASK /
CONTEXT / RULES / OUTPUT FORMAT (+ EXAMPLES where few-shot demonstrably helped) --
and every fact inside them is fetched at call time from the real data or the real
call arguments. Nothing about the business (metric names, dimension names,
dimension values, which metric is being forecast, which scope) is written into a
prompt as a literal: METRIC_LABELS / DIMENSION_VALUES come from forecasting_core.py,
which reads them off the CSV, and the metric/scope of each individual forecast is
passed in per call. The one thing kept intentionally OUT of llm_predict's prompt is
the other candidates' predictions -- see that function's docstring.

Runs on Claude Haiku via the Anthropic API. The API key is never hardcoded and never
passed through chat -- it's read from ANTHROPIC_API_KEY, either already set in the
environment or in a local, untracked .env file (ANTHROPIC_API_KEY=sk-ant-..., one
line). Nothing in this file prints, logs, or otherwise surfaces the key itself.
"""
import json
import os
import requests

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-haiku-4-5-20251001"
ANTHROPIC_VERSION = "2023-06-01"

# Single source of truth for "which literal word in the question justifies which
# non-default metric". Used TWICE below -- once to generate that rule's text inside
# _parse_dimension_and_metrics' prompt, and once as the post-call verification that
# the rule was actually followed. Previously these were two separate hardcoded lists
# (prose in the prompt, a dict in the checker) that could silently drift apart; now
# adding a metric trigger here updates both the instruction and the enforcement.
METRIC_TRIGGER_WORDS = {
    "gross_sales": ("gross", "before discount"),
    "profit": ("profit", "margin"),
    "quantity": ("unit", "quantity"),
}
DEFAULT_METRIC = "net_sales"

# Scope wording shared by llm_predict and phrase_answer so the backtest prompt and the
# live prompt describe scope identically -- if these two ever diverged, the champion
# tables would be validating a prompt that never actually runs.
WHOLE_BUSINESS_SCOPE = "whole business (all branches, routes and products combined)"


def scope_label(dimension=None, dimension_value=None):
    """(None, None) -> whole-business wording; ("branch", "Medical Branch 03") ->
    "branch = Medical Branch 03". One helper so every prompt names scope the same way."""
    if dimension and dimension_value:
        return f"{dimension} = {dimension_value}"
    if dimension:
        return f"{dimension} (no specific value)"
    return WHOLE_BUSINESS_SCOPE


def _load_env_file():
    """Dependency-free .env loader (avoids requiring python-dotenv for one file). Only ever
    reads ANTHROPIC_API_KEY=... lines into os.environ -- never printed, never logged, never
    written anywhere else."""
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())


_load_env_file()
API_KEY = os.environ.get("ANTHROPIC_API_KEY")


class LLMError(Exception):
    pass


def _chat(messages, want_json=False, temperature=None, log_fn=None):
    if not API_KEY:
        raise LLMError(
            "ANTHROPIC_API_KEY isn't set. Create a .env file in the backend directory "
            "containing a single line: ANTHROPIC_API_KEY=sk-ant-... (never commit or share "
            "that file), or export the variable in your shell before starting the server."
        )

    # Anthropic's API takes "system" as its own top-level field, not a message with
    # role="system" -- unlike Ollama's chat endpoint, which took everything in one list.
    system_parts = [m["content"] for m in messages if m["role"] == "system"]
    system = "\n\n".join(system_parts) if system_parts else None
    api_messages = [m for m in messages if m["role"] != "system"]

    if want_json:
        # Prefill: seeding the assistant turn with "{" constrains Claude's completion to
        # continue valid JSON, rather than relying on the prompt's instruction alone (there's
        # no separate "JSON mode" flag on this API the way Ollama had `format: "json"`). The
        # API returns only the continuation, not the prefill itself, so it's re-added below
        # before parsing.
        api_messages = api_messages + [{"role": "assistant", "content": "{"}]

    payload = {"model": MODEL, "max_tokens": 1024, "messages": api_messages}
    if system:
        payload["system"] = system
    if temperature is not None:
        payload["temperature"] = temperature

    emit = log_fn or (lambda msg: print(f"[llm] {msg}"))
    if system:
        emit(f"LLM INPUT (system): {system}")
    for msg in api_messages:
        if msg["role"] == "assistant" and msg["content"] == "{":
            continue  # the JSON prefill isn't a real input worth logging
        emit(f"LLM INPUT ({msg['role']}): {msg['content']}")

    try:
        r = requests.post(
            ANTHROPIC_URL, json=payload, timeout=60,
            headers={"x-api-key": API_KEY, "anthropic-version": ANTHROPIC_VERSION,
                     "content-type": "application/json"},
        )
        r.raise_for_status()
    except requests.exceptions.HTTPError:
        detail = ""
        try:
            detail = r.json().get("error", {}).get("message", "")
        except Exception:
            pass
        raise LLMError(f"Anthropic API error ({r.status_code}): {detail or r.text[:200]}")
    except requests.exceptions.RequestException as e:
        raise LLMError(f"Couldn't reach the Anthropic API: {e}")

    content = r.json()["content"][0]["text"]
    if want_json:
        content = "{" + content
    emit(f"LLM OUTPUT (raw): {content}")
    return content


MONTH_NAMES = {  # normalization only (LLM-recognized name -> calendar number),
                 # never used to pattern-match the user's raw text
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9, "october": 10,
    "oct": 10, "november": 11, "nov": 11, "december": 12, "dec": 12,
}


def _parse_dates(question, log_fn=None):
    """Sub-call 1/2: horizon + literal year/month only. This exact shape was
    proven reliable on its own before -- it only regressed after being merged
    into one bigger call together with dimension/metric extraction (see
    _parse_dimension_and_metrics below for why that merge broke things).
    Keeping it as its own small, single-purpose call is what makes it reliable
    again, not a change to the rules themselves.
    """
    system = (
        "ROLE: You are the date/period extraction stage of a sales forecasting assistant "
        "for a medical distribution business.\n\n"

        "TASK: Read the manager's question and report only two things -- the time grain "
        "being asked about, and any year or month that is literally spelled out in the "
        "question text.\n\n"

        "CONTEXT: You do not know today's date and must not act as if you do. Relative "
        'phrases like "next year", "this month" or "next week" are resolved further down '
        "the pipeline, in code, against the real end date of the dataset. Your job is "
        "recognition of literal text only -- never date arithmetic, never inference.\n\n"

        "RULES:\n"
        '- horizon: "week" = next/this week, "month" = next/this month, "year" = '
        "next/this/annual.\n"
        "- explicit_year / explicit_month: fill these in ONLY if that exact year or month "
        "is literally written in the question. Never compute or guess a year for a relative "
        'phrase like "next year" or "this year" -- leave it null and let the code resolve it '
        "against the real data.\n"
        '- If a month is named, horizon must be "month".\n'
        "- Anything you cannot read directly off the question text is null. A null is always "
        "safer here than a plausible guess, because a guessed date silently answers a "
        "different question than the one asked.\n\n"

        "OUTPUT FORMAT: Respond with ONLY this JSON object, no prose, no code fences:\n"
        '{"horizon": "week"|"month"|"year", '
        '"explicit_year": <4-digit year LITERALLY written in the question, else null>, '
        '"explicit_month": <month name LITERALLY written e.g. "January", else null>}\n\n'

        "EXAMPLES:\n"
        'Q: "what will next month revenue be" -> {"horizon": "month", "explicit_year": null, "explicit_month": null}\n'
        'Q: "what will next year sales be" -> {"horizon": "year", "explicit_year": null, "explicit_month": null}\n'
        'Q: "what is the revenue of year 2026" -> {"horizon": "year", "explicit_year": 2026, "explicit_month": null}\n'
        'Q: "sales for january 2027" -> {"horizon": "month", "explicit_year": 2027, "explicit_month": "January"}\n'
        'Q: "how did we do this week" -> {"horizon": "week", "explicit_year": null, "explicit_month": null}'
    )
    content = _chat([{"role": "system", "content": system},
                      {"role": "user", "content": question}], want_json=True, temperature=0, log_fn=log_fn)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        raise LLMError(f"Claude returned non-JSON: {content!r}")

    horizon = parsed.get("horizon", "month")
    horizon = horizon if horizon in ("week", "month", "year") else "month"

    explicit_year = parsed.get("explicit_year")
    try:
        explicit_year = int(explicit_year) if explicit_year else None
    except (TypeError, ValueError):
        explicit_year = None
    # Safety net mirroring _number_appears() below: an explicit_year is only ever
    # trustworthy if those exact 4 digits actually appear in the question text --
    # this is what catches a relative phrase ("next year") getting a guessed
    # absolute year despite the prompt rule against it (observed live: "next
    # year" -> 2024).
    if explicit_year is not None and str(explicit_year) not in question:
        if log_fn:
            log_fn(f"parse_query: dropped unverifiable explicit_year {explicit_year} "
                    f"-- those digits don't literally appear in the question")
        explicit_year = None

    explicit_month = None
    raw_month = parsed.get("explicit_month")
    if raw_month:
        candidate_month = MONTH_NAMES.get(str(raw_month).strip().lower())
        # Same safety-net principle as explicit_year above: only trust this if some real
        # spelling of that month actually appears in the question text. Checks every known
        # spelling that maps to the same month number (not just the LLM's returned string),
        # since it might say "Jan" for a question that literally says "january". This is
        # what catches a month being invented for a question with no month at all (observed
        # live: "Brampton branch revenue in 2027" -- no month mentioned -- hallucinated "January").
        question_lower = question.lower()
        if candidate_month and any(name in question_lower for name, num in MONTH_NAMES.items() if num == candidate_month):
            explicit_month = candidate_month
            horizon = "month"  # a specific month always means month-level, regardless of the LLM's own horizon guess
        elif candidate_month and log_fn:
            log_fn(f"parse_query: dropped unverifiable explicit_month {raw_month!r} "
                    f"-- no spelling of that month literally appears in the question")

    return {"horizon": horizon, "explicit_year": explicit_year, "explicit_month": explicit_month}


def _parse_dimension_and_metrics(question, log_fn=None):
    """Sub-call 2/2: which dimension (if any) + which metric(s).

    This was originally merged into the same call as _parse_dates, in one
    combined prompt. Testing surfaced that the combined version made the
    model compulsively fill in a dimension (customer/category/product) even
    on plain whole-business questions with no dimension mentioned at all --
    dimension recognition against several lists of real names is the
    heaviest sub-task here, and it got worse, not better, when sharing a
    prompt with three other extraction jobs. Splitting it into its own call
    and adding few-shot examples (the single most effective fix for small-
    model instruction-following on this kind of task) is what actually fixed
    it -- confirmed by re-running the same test questions after this change.
    """
    # Package-path adaptation for the backend copy (original imports "forecasting_core"
    # directly, correct for two sibling flat scripts -- this file now lives inside the
    # app.core package alongside it, so the import needs the full package path). Same
    # category of change as forecasting_core.py's DATA_PATH fix: import resolution, not
    # business logic -- the original at the project root is untouched and still uses the
    # bare import correctly for its own flat layout.
    from app.core.forecasting_core import DIMENSION_VALUES, METRIC_LABELS

    metric_names = list(METRIC_LABELS.keys())
    # Every dimension the dataset actually has, in the order forecasting_core loaded them,
    # plus the two that are recognized as a TYPE but never matched to a specific value
    # (product/customer -- see the note below on why their lists are withheld). Built from
    # the real data rather than typed out, so a new dimension column appears here on its own.
    listed_dims = [d for d in DIMENSION_VALUES if d not in ("product", "customer")]
    all_dims = list(DIMENSION_VALUES) + (["customer"] if "customer" not in DIMENSION_VALUES else [])
    dim_union = "|".join(f'"{d}"' for d in all_dims)

    # Keep the prompt compact (context-limit aware): only the small, high-value lists go in
    # verbatim -- branch/route/category/product_type/customer_type/supplier (15/30/15/7/5/30
    # real names). product (200) and customer (500 IDs) are deliberately left out -- recognized
    # only as a generic dimension type, never matched to one specific value; a list that size
    # wouldn't fit usefully, and made hallucination worse rather than better on the smaller
    # lists during testing (see the module docstring's earlier bug history). This means a
    # specific product can't be reliably asked about through this conversational flow --
    # only through the Model Playground's free-text field, which validates a typed name
    # against the real list directly instead of asking an LLM to recall it from a huge prompt.
    vocab_lines = "\n".join(f"- {d}: {DIMENSION_VALUES[d]}" for d in listed_dims)
    # Generated from METRIC_TRIGGER_WORDS so the instruction and the verification below can
    # never disagree about which word licenses which metric.
    trigger_lines = "; ".join(
        f'{"/".join(repr(w) for w in words)} -> "{m}"'
        for m, words in METRIC_TRIGGER_WORDS.items()
    )

    system = (
        "ROLE: You are the scope extraction stage of a sales forecasting assistant for a "
        "medical distribution business.\n\n"

        "TASK: Read the manager's question and report which single business dimension it is "
        "scoped to (if any), which exact value of that dimension, and which metric(s) it is "
        "asking about.\n\n"

        "CONTEXT: The vocabulary below is read live from the current dataset for this "
        "request -- it is the complete set of real values, not a sample and not something to "
        "recall from memory. A dimension_value is valid only as an exact string from these "
        "lists; a metric is valid only as one of these metric names.\n"
        f"Metrics: {metric_names}\n"
        f"{vocab_lines}\n"
        "Not listed, deliberately: individual products and individual customers. Recognize "
        "them as a dimension TYPE when named, but never as a specific value.\n\n"

        "RULES:\n"
        "- If the question does not mention any branch/route/category/product type/customer "
        'type/supplier/product/customer at all, dimension AND dimension_value are BOTH null. Do '
        "not guess one just because the question is about sales -- most questions are "
        "whole-business and have no dimension.\n"
        '- dimension_value must be an EXACT string from the matching list above. If the name in '
        'the question is generic ("which branch", "a route"), or not a real match (a typo, or a '
        'name that looks plausible but is not in the list, e.g. "Route A"), set "dimension" to '
        'the type but leave "dimension_value" null -- never substitute a different real value '
        "that merely resembles it.\n"
        '- A specific product (e.g. "Medical Product 0142") or customer (e.g. "CUST-0097") '
        'mentioned by name -> "dimension": "product" or "customer", "dimension_value" always '
        "null (no list is provided for these -- there is nothing to verify a specific one "
        "against here).\n"
        '- "supplier" mentioned by name only (not in the list above, or suppliers generally) '
        "-> set dimension, leave dimension_value null.\n"
        f'- metrics: the default is JUST ["{DEFAULT_METRIC}"]. Only pick a different or '
        "additional metric when one of these specific words actually appears in the question: "
        f"{trigger_lines}. A generic word like \"sales\"/\"revenue\"/\"performing\"/"
        '"performance"/"doing"/"business" on its own, with NONE of those specific words '
        f'present, is ALWAYS just ["{DEFAULT_METRIC}"] -- never expand it into more than one '
        "metric, REGARDLESS of whether a branch/route/year/category is also named in the same "
        "question. Naming a dimension or a time period never adds extra metrics by itself.\n\n"

        "OUTPUT FORMAT: Respond with ONLY this JSON object, no prose, no code fences:\n"
        f'{{"dimension": {dim_union}|null, '
        '"dimension_value": <EXACT matching string from the lists above, else null>, '
        f'"metrics": [array, one or more of {metric_names}]}}\n\n'

        "EXAMPLES:\n"
        'Q: "what will next month revenue be" -> {"dimension": null, "dimension_value": null, "metrics": ["net_sales"]}\n'
        'Q: "how many units did we sell in 2025" -> {"dimension": null, "dimension_value": null, "metrics": ["quantity"]}\n'
        'Q: "what will Medical Branch 03 sales be next month" -> {"dimension": "branch", "dimension_value": "Medical Branch 03", "metrics": ["net_sales"]}\n'
        'Q: "give me Medical Branch 07 revenue in 2027" -> {"dimension": "branch", "dimension_value": "Medical Branch 07", "metrics": ["net_sales"]}\n'
        'Q: "Medical Branch 03 performance" -> {"dimension": "branch", "dimension_value": "Medical Branch 03", "metrics": ["net_sales"]}\n'
        'Q: "Cardiovascular category sales" -> {"dimension": "category", "dimension_value": "Cardiovascular", "metrics": ["net_sales"]}\n'
        'Q: "how are Tablet sales doing" -> {"dimension": "product_type", "dimension_value": "Tablet", "metrics": ["net_sales"]}\n'
        'Q: "revenue from Hospital customers" -> {"dimension": "customer_type", "dimension_value": "Hospital", "metrics": ["net_sales"]}\n'
        'Q: "how is Medical Product 0142 selling" -> {"dimension": "product", "dimension_value": null, "metrics": ["net_sales"]}\n'
        'Q: "which branch has the highest revenue" -> {"dimension": "branch", "dimension_value": null, "metrics": ["net_sales"]}\n'
        'Q: "how is Route 99 performing" -> {"dimension": "route", "dimension_value": null, "metrics": ["net_sales"]}\n'
        'Q: "how is total company business doing this year" -> {"dimension": null, "dimension_value": null, "metrics": ["net_sales"]}\n'
        'Q: "net sale and gross sale in 2025" -> {"dimension": null, "dimension_value": null, "metrics": ["net_sales", "gross_sales"]}\n'
        'Q: "what profit margin did Medical Branch 05 make last month" -> {"dimension": "branch", "dimension_value": "Medical Branch 05", "metrics": ["profit"]}'
    )
    content = _chat([{"role": "system", "content": system},
                      {"role": "user", "content": question}], want_json=True, temperature=0, log_fn=log_fn)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        raise LLMError(f"Claude returned non-JSON: {content!r}")

    dimension = parsed.get("dimension")
    dimension_value = parsed.get("dimension_value")
    valid_dims = set(DIMENSION_VALUES) | {"customer"}
    if dimension not in valid_dims:
        dimension = None
    if dimension_value:
        real_values = DIMENSION_VALUES.get(dimension, [])
        if dimension_value not in real_values:
            if log_fn:
                log_fn(f"parse_query: dropped unverifiable dimension_value {dimension_value!r} "
                        f"-- not an exact match in the real {dimension} list")
            dimension_value = None

    metrics = parsed.get("metrics") or []
    metrics = [m for m in metrics if m in METRIC_LABELS] or [DEFAULT_METRIC]

    # Safety net, same principle as explicit_year/explicit_month above: the prompt's own rule
    # (generated from METRIC_TRIGGER_WORDS, a few lines up) says which literal word justifies
    # each non-default metric -- verify that was actually followed rather than trust it.
    # Observed live: "revenue" combined with a branch/route name and a year sometimes pulled in
    # gross_sales anyway (once even dropping net_sales entirely for it) despite no word implying
    # gross sales anywhere in the question -- a few-shot example fixed the common case but not
    # every branch/route name.
    question_lower = question.lower()
    verified = []
    for m in metrics:
        required = METRIC_TRIGGER_WORDS.get(m)
        if required and not any(w in question_lower for w in required):
            if log_fn:
                log_fn(f"parse_query: dropped unverifiable metric {m!r} -- none of "
                        f"{required} literally appear in the question")
            continue
        verified.append(m)
    metrics = verified or [DEFAULT_METRIC]

    return {"dimension": dimension, "dimension_value": dimension_value, "metrics": metrics}


def parse_query(question, log_fn=None):
    """question (free text) -> dict with horizon, explicit_year, explicit_month,
    dimension, dimension_value, metrics.

    TWO focused LLM calls (see _parse_dates and _parse_dimension_and_metrics),
    fed the real dynamic lists (branches/routes/categories/products/suppliers,
    metric names) from forecasting_core.py -- this replaces what used to be
    three separate regex functions (parse_query's old year/month regex,
    detect_metrics, detect_out_of_scope). The LLM does only RECOGNITION here
    (matching text against a provided, closed, real vocabulary) -- never
    ARITHMETIC. That distinction is deliberate and already cost real bugs
    when crossed, each with a matching safety net below:
      1. Asking it to compute an absolute year for "next year"/"this year"
         (no notion of today's date) -> inconsistent guesses (2026, then 2024
         on a later regression). explicit_year is now verified against the
         question's literal text in _parse_dates, same pattern as
         _number_appears() below.
      2. A single combined call asking for horizon+dates+dimension+metrics
         in one shot made the model compulsively hallucinate a dimension
         (customer/category/product) on plain whole-business questions, and
         substitute a plausible-but-wrong REAL value for generic ("which
         branch") or fake ("Route A") mentions -- the exact-match check alone
         doesn't catch the latter, since the substituted value is real, just
         wrong. Fixed by splitting into two single-purpose calls and adding
         few-shot examples to the dimension call.
    Year/month values here are ONLY ever what's *literally read off* the
    question text (an explicit "2027", a literal "January") -- resolving a
    RELATIVE phrase into an actual calendar date still happens in
    forecasting_core.py, against the data's own end date, never guessed here.
    """
    dates = _parse_dates(question, log_fn=log_fn)
    dim_metrics = _parse_dimension_and_metrics(question, log_fn=log_fn)
    return {**dates, **dim_metrics}


def llm_predict(history_values, horizon, period_label, metric_label=None,
                 dimension=None, dimension_value=None, log_fn=None):
    """Stream 2: the LLM's own forecast candidate. Deterministic (temperature=0)
    so it can be fairly and repeatably backtested against Stream 1's models --
    NOT trusted just because it ran; score_whole_business.py decides if it's used.

    What it IS told, all fetched per call rather than written into the prompt:
      - period_label   the frequency word only ("weekly"/"monthly")
      - metric_label   what these numbers actually measure ("net sales", "profit", ...)
      - dimension/value  what slice they cover, via scope_label()
      - history_values the real series (last 36 points used, to keep the prompt compact)

    What it is deliberately NOT told: the user's original question, and the other
    candidates' predictions or scores. Both exclusions are the point -- this has to be
    an INDEPENDENT candidate for "it won the backtest" to mean it forecasts well, rather
    than that it copied whichever neighbour looked most convincing.

    Caught during this integration: metric_label didn't exist, and both the system prompt
    and the user message hardcoded the literal words "net sales" -- so every profit
    backtest was telling the model it was looking at net sales, and any future non-net_sales
    champion would have done the same live. metric_label defaults to None -> "the series"
    (honestly vague) rather than a confident wrong guess, so a caller that forgets it
    produces a truthful prompt instead of a lie.
    """
    recent = [round(float(v), 1) for v in history_values[-36:]]  # keep prompt compact
    what = metric_label or "the series"
    scope = scope_label(dimension, dimension_value)
    system = (
        "ROLE: You are one forecasting candidate among several in a medical sales "
        "forecasting system -- a numeric sequence forecaster, nothing else.\n\n"

        f"TASK: Continue the series. Given recent {period_label} {what} totals for "
        f"{scope}, predict the next {horizon} value(s) in order.\n\n"

        "CONTEXT: Your prediction is not trusted on the strength of having been produced. "
        "It is scored on real held-out data against statistical baselines and a pretrained "
        "time-series model, and it is only used for live answers where it measurably beat "
        "all of them for this exact metric, scope and horizon. You are not shown the other "
        "candidates' predictions, so there is nothing to agree with -- forecast the series "
        "on its own terms.\n\n"

        "RULES:\n"
        "- Use only the numbers provided. Do not assume seasonality, growth or events that "
        "are not visible in the sequence itself.\n"
        "- Stay in the same unit and order of magnitude as the input.\n"
        f"- Return exactly {horizon} number(s), oldest predicted period first.\n"
        "- Plain numbers only: no currency symbols, no thousands separators, no ranges, no "
        "commentary.\n\n"

        "OUTPUT FORMAT: Respond with ONLY this JSON object, no prose, no code fences:\n"
        '{"predictions": [num, num, ...]}'
    )
    user = (
        f"Metric: {what}\n"
        f"Scope: {scope}\n"
        f"Frequency: {period_label}\n"
        f"Predict: the next {horizon} {period_label} value(s)\n"
        f"History (oldest to newest, {len(recent)} points): {recent}"
    )
    content = _chat([{"role": "system", "content": system}, {"role": "user", "content": user}],
                     want_json=True, temperature=0, log_fn=log_fn)
    try:
        parsed = json.loads(content)
        preds = [float(v) for v in parsed["predictions"]][:horizon]
        if len(preds) < horizon:  # pad if the model under-produced
            preds += [preds[-1]] * (horizon - len(preds))
        return preds
    except (json.JSONDecodeError, KeyError, ValueError, IndexError) as e:
        raise LLMError(f"Claude returned an unusable forecast: {content!r} ({e})")


def _number_appears(text, value):
    """Guard against the LLM silently restating a different number (observed live:
    given 94,519 it twice wrote 95,109 / 102,331 instead). Accept a few plausible
    formattings; anything else means the phrasing is untrusted."""
    import re
    candidates = {f"{value:,.0f}", f"{value:.0f}", f"{value:,.1f}",
                  f"{round(value):,}", f"{round(value/1000)}k", f"{round(value/1000)},000"}
    digits_only = lambda s: re.sub(r"[^\d]", "", s)
    text_numbers = set(re.findall(r"[\d,]+(?:\.\d+)?", text))
    return any(digits_only(c) == digits_only(t) for c in candidates for t in text_numbers)


def phrase_answer(question, horizon, model_name, predicted_value, reason,
                   period_label=None, is_actual=False, metric_label=None,
                   dimension=None, dimension_value=None, log_fn=None):
    """The precomputed number + which model produced it -> a plain-language answer.
    temperature=0 (still verified, not just trusted) and the exact figure is
    checked against the output -- if the model drifts the number, fall back to
    a template that can't get the number wrong.

    Everything the prompt needs is passed in and none of it is invented here: the
    question as asked, the already-computed number, the metric's real label, and the
    dimension scope. This stage NEVER computes, adjusts or re-derives the figure -- it
    only narrates the one it was handed.

    Caught live, twice, in that order:
      1. metric_label was missing entirely -- every prompt hardcoded the literal words
         "net sales" regardless of what was actually being asked (gross sales, units
         sold, ...), so the answer said "net sales" over a gross-sales number.
      2. dimension/dimension_value were still missing after that fix -- a branch-scoped
         answer had no reliable way to say which branch it was about, since the only
         hint was whatever the raw question text happened to contain.
    """
    # Same rule as llm_predict: a missing metric_label becomes honestly vague rather
    # than a confident "net sales" over a number that may be something else.
    metric_label = metric_label or "the requested metric"
    scope = scope_label(dimension, dimension_value)
    scoped = bool(dimension_value)

    if is_actual:
        system = (
            "ROLE: You are a sales analyst reporting a real, already-recorded figure to a "
            "manager.\n\n"

            "TASK: State the figure you are given, in 1-2 short sentences, answering the "
            "manager's question directly.\n\n"

            "CONTEXT: This number is not a forecast. It is a direct sum of recorded "
            "transactions for a period that has already closed, computed before you were "
            "called. It is already correct.\n\n"

            "RULES:\n"
            "- Report the figure EXACTLY as given -- never round it, never recalculate it, "
            "never adjust it.\n"
            "- Never say it cannot be determined, and never hedge it as an estimate. It is a "
            "recorded fact.\n"
            "- Say what the number covers: the period, and the scope if the scope is not the "
            "whole business.\n"
            "- Do not invent context that was not given to you -- no causes, no comparisons "
            "to other periods, no external factors.\n\n"

            "OUTPUT FORMAT: 1-2 plain sentences of prose. No JSON, no headings, no bullet "
            "points, no markdown."
        )
        user = (
            f"Question as asked: {question}\n"
            f"Metric: {metric_label}\n"
            f"Scope: {scope}\n"
            f"Period: {period_label}\n"
            f"Recorded {metric_label} (state exactly): {predicted_value:,.0f}\n"
        )
    else:
        system = (
            "ROLE: You are a sales analyst explaining a forecast to a manager.\n\n"

            "TASK: Answer the manager's question in 2-3 short, plain sentences using the "
            "forecast figure you are given, and say briefly which method produced it and "
            "why that method.\n\n"

            "CONTEXT: The figure was already computed by the named forecasting method, "
            "which earned this slot by winning a real backtest against every other "
            "candidate for this exact metric, scope and horizon. You are narrating a "
            "finished result -- you are not forecasting, checking or adjusting anything.\n\n"

            "RULES:\n"
            "- State the figure EXACTLY as given -- never round it, never recalculate it, "
            "never soften it into a range of your own invention.\n"
            "- Name the method and give the one-line reason you were given for it.\n"
            "- Say what the number covers: the period, and the scope if the scope is not the "
            "whole business.\n"
            "- Do not invent anything you were not given -- no causes, no market conditions, "
            "no confidence percentages, no comparisons to periods you have no numbers for.\n\n"

            "OUTPUT FORMAT: 2-3 plain sentences of prose. No JSON, no headings, no bullet "
            "points, no markdown."
        )
        user = (
            f"Question as asked: {question}\n"
            f"Metric: {metric_label}\n"
            f"Scope: {scope}\n"
            f"Horizon: {horizon}" + (f" ({period_label})" if period_label else "") + "\n"
            f"Forecasted {metric_label} (state exactly): {predicted_value:,.0f}\n"
            f"Method used: {model_name}\n"
            f"Why this method: {reason}\n"
        )

    text = _chat([{"role": "system", "content": system}, {"role": "user", "content": user}],
                 temperature=0, log_fn=log_fn)
    if _number_appears(text, predicted_value):
        return text
    # Verification failed -- don't show a sentence with a wrong number in it. The fallbacks
    # name the same metric and scope the prompt did, so a fallback answer is never less
    # specific about what it covers than a successful one.
    if log_fn:
        log_fn(f"phrase_answer: LLM's number didn't match {predicted_value:,.0f} -- using safe fallback template")
    where = f" for {scope}" if scoped else ""
    if is_actual:
        return (f"Actual {metric_label}{where} for {period_label or horizon}: "
                f"**{predicted_value:,.0f}** (recorded, not a forecast).")
    return (f"Projected {metric_label}{where} for {period_label or horizon}: "
            f"**{predicted_value:,.0f}** (method: {model_name}). *(Claude's phrasing didn't "
            f"match the computed figure, so showing the raw number instead.)*")


def parse_intent(question, log_fn=None):
    """Is this question asking WHY something changed (a decline/growth explanation), or asking
    WHAT a number IS or WILL BE (a plain value or forecast)? Two completely different backend
    paths handle each -- explain_decline() computes a real drill-down; answer_question() looks
    up or forecasts a single number. This is its own single-purpose recognition call, same
    reasoning as _parse_dates vs _parse_dimension_and_metrics being split apart: one focused
    job per call, not folded into an existing one and risking the same regression that split
    caused it to fix. Defaults to "value" on any doubt -- the lighter, narrower path is the
    safe default when uncertain, not the one that runs a multi-level drill-down.
    """
    system = (
        "ROLE: You are the intent-classification stage of a sales assistant for a medical "
        "distribution business.\n\n"

        "TASK: Decide whether the manager's question is asking WHY a number changed -- a "
        "reason, cause, or driver behind a change -- or asking WHAT a number IS or WILL BE -- "
        "a plain value, an actual figure, or a forecast.\n\n"

        "CONTEXT: These two question types are answered by completely different systems. "
        "Getting this wrong sends the question to the wrong one entirely, so classify only "
        "what is actually being asked, never what might also be interesting to mention.\n\n"

        "RULES:\n"
        '- "explain": the question explicitly asks for a REASON, CAUSE, or DRIVER -- words '
        'like "why", "what caused", "what\'s driving", "what happened to", "reason for".\n'
        '- "value": everything else -- a plain number, a forecast, a question that merely '
        "states or reports a change with no request for a reason, or a question with no "
        "reference to a prior period at all.\n"
        '- Merely mentioning a decrease or increase is NOT enough by itself -- "sales '
        'decreased in 2025" stated as a fact, with no "why"/"what caused" framing, is still '
        '"value" (it is just reporting the number, not asking for a cause).\n\n'

        "OUTPUT FORMAT: Respond with ONLY this JSON object, no prose, no code fences:\n"
        '{"intent": "explain"|"value"}\n\n'

        "EXAMPLES:\n"
        'Q: "why did my sales decrease in 2025" -> {"intent": "explain"}\n'
        'Q: "what caused the drop in profit last year" -> {"intent": "explain"}\n'
        'Q: "what\'s driving the decline in Branch 03" -> {"intent": "explain"}\n'
        'Q: "why is Branch 03 underperforming this year" -> {"intent": "explain"}\n'
        'Q: "what will net sales be next year" -> {"intent": "value"}\n'
        'Q: "what were net sales in 2025" -> {"intent": "value"}\n'
        'Q: "sales decreased in 2025, what was the total" -> {"intent": "value"}\n'
        'Q: "how is Branch 03 performing" -> {"intent": "value"}'
    )
    content = _chat([{"role": "system", "content": system},
                      {"role": "user", "content": question}], want_json=True, temperature=0, log_fn=log_fn)
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        raise LLMError(f"Claude returned non-JSON: {content!r}")
    intent = parsed.get("intent")
    return intent if intent in ("explain", "value") else "value"


def _pct(v):
    """None-safe percent formatter -- delta_pct is None whenever the comparison period's
    total was zero (nothing to divide by), which is a real, valid case, not an error."""
    return f"{v:+.1f}%" if v is not None else "not available (comparison period had no data)"


def _num(v):
    """None-safe plain-number formatter, same reasoning as _pct -- avg_price's own value is
    undefined (not zero) whenever that period had zero quantity to divide by."""
    return f"{v:,.2f}" if v is not None else "not available (no sales that period)"


def decline_fallback_text(explanation):
    """A template that states explain_decline()'s real numbers plainly, in the same order
    phrase_decline_explanation's prompt gives them -- can't misstate any of them, since it's
    not generated, just formatted. Used both when phrase_decline_explanation's own
    verification fails (below) and when the Anthropic call fails outright (caller's problem,
    same split as phrase_answer's fallback vs ask_service.py's own external one)."""
    total = explanation["total"]
    label = explanation["metric_label"]
    scope = scope_label(explanation.get("scope_dimension"), explanation.get("scope_value"))
    lines = []
    if explanation.get("horizon_note"):
        lines.append(f"Note: {explanation['horizon_note']}.")
    lines.append(f"{label.capitalize()} for {scope} went from {total['comparison']:,.0f} in "
                  f"{explanation['comparison_year']} to {total['target']:,.0f} in "
                  f"{explanation['target_year']} ({_pct(total['delta_pct'])}).")
    for lvl in explanation["levels"]:
        tag = "dominant driver" if lvl["concentrated"] else "not the dominant driver, broadly spread"
        lines.append(f"Within that, {lvl['dimension']} = {lvl['value']} moved from "
                      f"{lvl['comparison']:,.0f} to {lvl['target']:,.0f} ({_pct(lvl['delta_pct'])}), "
                      f"{lvl['share_of_parent_decline_pct']:.1f}% of that level's change ({tag}).")
    if explanation.get("stopped_reason"):
        lines.append(f"Note: {explanation['stopped_reason']}.")
    driver = explanation.get("driver")
    if driver:
        lines.append(f"At the product level: quantity {_pct(driver['quantity']['delta_pct'])}, "
                      f"avg price {_pct(driver['avg_price']['delta_pct'])}, "
                      f"distinct customers {_pct(driver['distinct_customers']['delta_pct'])} -- "
                      f"most-moved factor: {driver['primary_driver']}.")
    return " ".join(lines)


def phrase_decline_explanation(question, explanation, log_fn=None):
    """explanation = the real dict from forecasting_core.explain_decline() -- every number in
    it is already computed and verified. This call's only job is turning that structure into
    prose; it never computes, adjusts, or adds a number that is not already in `explanation`,
    and never sees the raw transaction database.
    """
    label = explanation["metric_label"]
    total = explanation["total"]
    direction = explanation["direction"]
    levels = explanation["levels"]
    driver = explanation["driver"]
    stopped_reason = explanation.get("stopped_reason")
    scope = scope_label(explanation.get("scope_dimension"), explanation.get("scope_value"))

    path_lines = "\n".join(
        f"- {lvl['dimension']} = {lvl['value']}: {lvl['comparison']:,.0f} -> {lvl['target']:,.0f} "
        f"({_pct(lvl['delta_pct'])}), {lvl['share_of_parent_decline_pct']:.1f}% of the movement at "
        f"this level"
        + (" [dominant driver at this level]" if lvl["concentrated"]
           else " [NOT the dominant driver -- movement here was broadly spread]")
        + (f" (note: {lvl['offset_note']})" if lvl.get("offset_note") else "")
        for lvl in levels
    )
    driver_lines = ""
    if driver:
        driver_lines = (
            f"Quantity: {driver['quantity']['comparison']:,.0f} -> {driver['quantity']['target']:,.0f} "
            f"({_pct(driver['quantity']['delta_pct'])})\n"
            f"Avg price: {_num(driver['avg_price']['comparison'])} -> {_num(driver['avg_price']['target'])} "
            f"({_pct(driver['avg_price']['delta_pct'])})\n"
            f"Distinct customers: {driver['distinct_customers']['comparison']} -> "
            f"{driver['distinct_customers']['target']} ({_pct(driver['distinct_customers']['delta_pct'])})\n"
            f"Most-moved factor (largest % change): {driver['primary_driver']}\n"
        )

    system = (
        "ROLE: You are a sales analyst explaining a real, already-computed change analysis to "
        "a manager.\n\n"

        "TASK: In clear, plain paragraphs, explain what changed and why, using ONLY the "
        "figures given below, in the order given: the scope's total, then each drill-down "
        "level found, then the driver breakdown if one is present.\n\n"

        "CONTEXT: Every number below was computed directly from recorded transactions -- none "
        "of it is a guess, a forecast, or an estimate. This works symmetrically for growth and "
        "decline -- \"Direction\" below is the real, measured direction, and it may be either. "
        "Compare it against what the question assumed (words like \"decrease\"/\"drop\"/"
        "\"decline\" vs \"increase\"/\"grow\"/\"rise\"): if they disagree (e.g. the question "
        "asked why something decreased but it actually increased), correct that premise "
        "plainly. If they agree, or the question was direction-neutral (e.g. \"why did sales "
        "change\"), just explain what happened using the numbers below -- there is nothing to "
        "correct. The drill-down always goes branch -> category -> product regardless of how "
        "concentrated any one level is -- each level below is tagged [dominant driver] or "
        "[NOT the dominant driver]; report every level given, even the ones marked \"not "
        "dominant\" and even when a shallower level wasn't concentrated either -- a branch "
        "that's only part of the story is still real, useful detail, not something to skip.\n\n"

        "RULES:\n"
        "- State every figure exactly as given -- never round differently, recalculate, or "
        "invent a number not listed below.\n"
        "- Only correct the question's premise if it named a direction that disagrees with the "
        "real \"Direction\" below -- otherwise explain the real movement directly, growth "
        "included, with no correction needed.\n"
        "- Narrate every drill-down level given, in order -- do not stop early or omit a level "
        "just because it wasn't the dominant driver; say so honestly instead (e.g. \"within "
        "that, X accounted for only 21%, so no single branch was really behind it, but the "
        "biggest single piece was...\").\n"
        "- Never invent a cause, external factor, market condition, or event not present in "
        "the data below -- if the data doesn't show a reason, say the numbers don't explain "
        "one, rather than guessing at outside causes.\n"
        "- If a \"Scope mismatch to mention\" line is given, state it plainly near the start "
        "of your answer -- the comparison covers different periods than the question asked "
        "about, and the manager needs to know that before reading the numbers.\n"
        "- If a driver breakdown is given, state which of the three factors moved the most, "
        "and by how much.\n"
        "- A level's percentage is its share of the movement (decline or growth) that happened "
        "anywhere at that level, not a share of the level's overall net change -- if a note "
        "says the opposite direction elsewhere partly offset it, mention that plainly (e.g. "
        "\"partly offset by decline elsewhere\" for a growth story, or \"partly offset by "
        "growth elsewhere\" for a decline), since the net change at that level is smaller than "
        "this one value's own move would suggest.\n\n"

        "OUTPUT FORMAT: 3-5 short, plain sentences -- concise and concrete, no filler words or "
        "throat-clearing, get straight to the numbers. No headings, no bullet points, no "
        "markdown, no JSON."
    )
    horizon_note = explanation.get("horizon_note")
    user = (
        f"Question as asked: {question}\n"
        f"Metric: {label}\n"
        f"Scope: {scope}\n"
        f"{explanation['comparison_year']} -> {explanation['target_year']}: "
        f"{total['comparison']:,.0f} -> {total['target']:,.0f} ({_pct(total['delta_pct'])})\n"
        f"Direction: {direction}\n"
        + (path_lines + "\n" if path_lines else "")
        + (f"Note: {stopped_reason}\n" if stopped_reason else "")
        + (f"Scope mismatch to mention: {horizon_note}\n" if horizon_note else "")
        + driver_lines
    )
    text = _chat([{"role": "system", "content": system}, {"role": "user", "content": user}],
                 temperature=0, log_fn=log_fn)

    # Verify the key figures actually made it into the text, same discipline as phrase_answer's
    # single-number check -- here there are several, so every one must appear.
    check_values = [total["delta_pct"]] + [lvl["delta_pct"] for lvl in levels]
    if driver:
        check_values += [driver["quantity"]["delta_pct"], driver["avg_price"]["delta_pct"],
                          driver["distinct_customers"]["delta_pct"]]
    ok = all(_number_appears(text, v) for v in check_values if v is not None)
    if ok:
        return text
    if log_fn:
        log_fn("phrase_decline_explanation: not every figure verified in the LLM's text -- "
               "using safe fallback template")
    return decline_fallback_text(explanation)


def recommendation_fallback(explanation):
    """A template built directly from explain_decline()'s real fields -- used both when
    generate_recommendation()'s own verification fails and when the API call fails outright."""
    levels = explanation.get("levels", [])
    driver = explanation.get("driver")
    if not levels:
        return "No significant year-over-year change was found here to act on."
    deepest = levels[-1]
    if driver and driver.get("primary_driver"):
        factor = {"quantity": "units sold", "avg_price": "the average price",
                  "distinct_customers": "the number of distinct customers"}[driver["primary_driver"]]
        return (f"Start with {factor} for {deepest['dimension']} = {deepest['value']} -- it moved "
                f"the most of the three factors measured at that level.")
    if not any(lvl["concentrated"] for lvl in levels):
        return (f"No single {levels[0]['dimension']} dominates this movement -- it's broadly spread, "
                f"so a single targeted fix is unlikely to move the total much on its own.")
    return f"Start by reviewing {deepest['dimension']} = {deepest['value']}, the largest single contributor found."


def _recommendation_grounded(text, explanation):
    """Loose grounding check -- advice isn't a single number to verify byte-for-byte the way
    phrase_answer/phrase_decline_explanation check theirs, so this checks that at least one
    REAL entity name from the computed finding (a drilled dimension value, or the driver
    factor that moved most) actually appears, catching a recommendation that drifted into
    generic, ungrounded territory rather than naming the specific thing the data found."""
    candidates = [lvl["value"] for lvl in explanation.get("levels", [])]
    driver = explanation.get("driver")
    if driver and driver.get("primary_driver"):
        candidates.append({"quantity": "unit", "avg_price": "price",
                            "distinct_customers": "customer"}[driver["primary_driver"]])
    if not candidates:
        return True  # nothing to ground against (e.g. a flat/no-movement case) -- any honest text passes
    text_lower = text.lower()
    return any(str(c).lower() in text_lower for c in candidates)


def generate_recommendation(explanation, log_fn=None):
    """One short, grounded next step derived ONLY from explain_decline()'s already-computed
    finding -- never generic advice ("run a marketing campaign") untethered to a specific
    number already shown, and never a fabricated cause. If nothing concentrated enough to act
    on was found, says so plainly instead of inventing a lever.
    """
    levels = explanation.get("levels", [])
    driver = explanation.get("driver")
    path_lines = "\n".join(
        f"- {lvl['dimension']} = {lvl['value']}: {_pct(lvl['delta_pct'])}, "
        f"{lvl['share_of_parent_decline_pct']:.1f}% of the movement at this level, "
        f"concentrated={lvl['concentrated']}"
        for lvl in levels
    )
    driver_line = ""
    if driver:
        driver_line = (f"Driver breakdown -- quantity {_pct(driver['quantity']['delta_pct'])}, "
                        f"avg price {_pct(driver['avg_price']['delta_pct'])}, "
                        f"distinct customers {_pct(driver['distinct_customers']['delta_pct'])}, "
                        f"most-moved factor: {driver['primary_driver']}\n")

    system = (
        "ROLE: You are a sales analyst turning an already-computed change analysis into ONE "
        "short, concrete next step for a manager.\n\n"

        "TASK: Recommend a single, specific thing worth investigating, based ONLY on the "
        "finding below. If nothing in the data points anywhere specific, say so honestly "
        "instead of inventing a recommendation.\n\n"

        "CONTEXT: This is a real, verified computation, not a guess. Your recommendation must "
        "point at the SAME specific dimension value and/or driver factor already found below.\n\n"

        "RULES:\n"
        "- Name the specific dimension value (branch/category/product) and/or driver factor "
        "from the data below -- never a generic recommendation that could apply to any "
        "business (\"increase marketing\", \"improve customer service\", \"boost visibility\") "
        "without naming the actual segment or factor found here.\n"
        "- If every level below has concentrated=False, the movement was broadly spread -- say "
        "so honestly and suggest reviewing the full breakdown rather than inventing one fix.\n"
        "- If there is no finding at all (no levels), say plainly that nothing stood out to "
        "act on rather than manufacturing a recommendation.\n"
        "- Never mention external factors (market conditions, competitors, seasonality, the "
        "economy) unless they are literally present in the data below -- they never are.\n\n"

        "OUTPUT FORMAT: 1-2 plain sentences of prose. No headings, no bullet points, no markdown."
    )
    user = (
        f"Metric: {explanation['metric_label']}\n"
        f"Direction: {explanation['direction']}\n"
        + (path_lines + "\n" if path_lines else "(no levels -- direction was flat or no data)\n")
        + driver_line
    )
    text = _chat([{"role": "system", "content": system}, {"role": "user", "content": user}],
                 temperature=0, log_fn=log_fn)
    if _recommendation_grounded(text, explanation):
        return text
    if log_fn:
        log_fn("generate_recommendation: text didn't reference the real finding -- using safe fallback template")
    return recommendation_fallback(explanation)
