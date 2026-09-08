# BizWiz Sales Assistant — UI Flow

## Found while double-checking a "same answer" report that turned out to be correct

User reported "netsale in 2027" and "revenue in 2027" giving the same answer (94,519) — that part is actually correct (they mean the same metric, same year, should match). But verifying it surfaced a real bug next to it: `detect_metrics()` required "gross"/"net" and "sale" to appear as separate word-boundary tokens anywhere in the question, which broke the moment they were typed with no space — **"grosssale" silently matched nothing and fell through to the net_sales default**, giving the wrong metric with no warning. Fixed by matching "gross"/"net" directly adjacent to "sale(s)"/"revenue" with `\s*` (zero-or-more spaces) instead of separate word-boundary checks. Verified: "grosssale" now correctly detects `gross_sales`; every previously-verified phrasing (multi-metric, quantity, plain "revenue") unaffected.

## Logs now also reach the browser's actual DevTools Console

Not a bug, a gap: Streamlit runs entirely server-side, so `print()`/`st.code()` only ever reached the terminal and the on-page log panel — nothing was writing to the browser's separate JavaScript console (DevTools → Console tab), which is where the user was actually looking. Added `push_to_browser_console()` in `app.py`, using `components.html()` (not `st.markdown(unsafe_allow_html=True)`, which doesn't reliably execute injected `<script>` tags) to run a real `console.log()` in the page for the same lines already shown on-page and in the terminal. Same content, three places now.

## The real holdout test — 2027, never seen by the model

`generate_2027_holdout.py` regenerates the exact same 6-year process (same seed, same formulas as `generate_6yr_data.py`) extended one more year, **verifies 2021-2026 comes out byte-identical** to the training file before trusting anything (caught and fixed a false-mismatch bug in that check first — see below), then saves *only* 2027 to `bizwiz_2027_holdout_ACTUAL.csv`. `bizwiz_6yr_sales_data.csv` — what the model actually trains on — is never touched.

`validate_2027.py` then compares what every candidate predicted for 2027 (trained only on 2021-2026) against what actually happened, using the live app's own `run_forecast()`:

| Model | Monthly MAPE | Full-year total | vs. actual (91,060.8) |
|---|---|---|---|
| naive | 35.1% | 117,879 | −29.5% |
| moving average | 24.3% | 107,110 | −17.6% |
| linear trend | 11.6% | 94,519 | **−3.8%** |
| seasonal-naive | 11.2% | 87,184 | +4.3% |
| **Chronos-2** | **10.3%** | 95,870 | −5.3% |

**The finding that matters:** the champions `score_6yr.py` picked *before 2027 existed* — Chronos-2 for monthly, linear trend for yearly — are the same models that win on this genuinely blind data. Real confirmation the methodology generalizes, not an artifact of one particular split. December was underestimated by every model again (actual 10,998 vs. Chronos's 10,054) — same holiday-peak weakness flagged earlier, now confirmed on completely fresh data.

**Bug caught building this:** the first identity check between the regenerated 2021-2026 and the training file reported a false mismatch — every numeric column (including `net_sales`) matched exactly, but the `offer` column didn't, because `pd.read_csv` silently reads the literal string `"None"` back as `NaN` while the in-memory dataframe still held the string. Fixed by round-tripping both sides through CSV the same way before comparing, rather than trusting an in-memory comparison that never goes through the same serialization the real file does.

## Two more caught live

8. **Confirmed hardcoded bug: every `phrase_answer()` prompt said "net sales" literally, regardless of which metric was actually being asked about.** `metric_label` was never threaded through when multi-metric support was added — so asking about gross sales or units sold still told the LLM "Forecasted net sales: X," and its answer echoed "net sales" even though the number underneath was something else. Fixed: `phrase_answer()` now takes `metric_label` (wired from `app.py`'s actual computed `label`) and every prompt/fallback string uses it. Verified: asking about gross sales now correctly produces "gross sales" throughout, not "net sales."

9. **Full LLM and model input/output logging added**, at the user's request. Every `_chat()` call (parse, phrase, Stream-2 predict) now logs its exact system+user prompt and the raw response text; every `run_forecast()`/`run_forecast_with_range()` call logs the exact input history (last 6 points) and the raw output array before any rounding/summing. All of it flows into the same on-page log panel and terminal as before — nothing new to look at, just nothing hidden anymore either.

## Validation vs. deployment — why the live app uses all 5 years

Two different jobs share the name "testing," at two different stages:
1. **Validation** (`score_whole_business.py`, `score_dimensional.py`) — train strictly through **2024-12-31**, test on **held-out 2025** (`TRAIN_END`/`TEST_START`/`TEST_END` constants at the top of each script) — the champion is picked using real MAPE scores against 2025 data no candidate ever trained on. Already done, still valid — that evidence doesn't expire, and re-running either script reproduces it from the same split.
2. **Deployment** (`app.py`, via `forecasting_core.py`'s `DATA_PATH`/`load_series()`) — once a method is proven by step 1, it's retrained on *everything available* (2025 included) before answering real questions about the genuine future (2026+). This is standard practice, not a mistake: refusing to ever let the live app see 2025 would mean today's "next month" forecasts January 2025 — a month that already happened by the time anyone's asking.

Worth being explicit about since it's easy to conflate: the *decision* of which model to trust never saw 2025. The *live number* it then produces does use 2025, because by the time someone's asking "what will next month be," 2025 is history, not future.

## Rolling-origin backtest — continued testing without waiting for 2027 (`rolling_backtest.py`)

Re-runs the same held-out-year test at every cut point the 6 years allow, not just 2025→2026 — 4 independent folds, each trained only on data strictly before its test year:

| Model | 2023 | 2024 | 2025 | 2026 | AVG |
|---|---|---|---|---|---|
| naive (last value) | 29.8 | 40.9 | 20.4 | 33.3 | 31.1 |
| moving average | 21.1 | 26.6 | 12.3 | 17.5 | 19.4 |
| linear trend | 14.6 | 15.6 | 10.4 | 13.0 | 13.4 |
| seasonal-naive | 13.9 | **7.8** | 14.5 | 12.8 | 12.3 |
| **Chronos-2** | 17.5 | 13.6 | **7.9** | **9.6** | **12.2** |

**Honest read:** seasonal-naive won 2023 and 2024; Chronos-2 won 2025 and 2026 — genuinely split, not a clean sweep either way. Chronos-2 takes the average by a hair (12.2 vs 12.3), but the more interesting signal is the *trend*: Chronos-2's error falls steadily as more training history becomes available across folds (17.5 → 13.6 → 7.9 → 9.6), while seasonal-naive is comparatively erratic (13.9 → 7.8 → 14.5 → 12.8) — it always looks back exactly one year regardless of how much other history exists, so more data doesn't help it the way it helps Chronos-2. That's a real reason to lean toward Chronos-2 going forward as more real data accumulates, beyond just "it won the one fold we happened to run first."

**The actual, ongoing answer to "how do we keep testing":** re-run `rolling_backtest.py` whenever meaningfully more real data comes in — each additional real year becomes a new fold automatically. The only test this *can't* substitute for is comparing a live "2027" prediction against the real 2027 once it actually happens — that one still has to wait for real time to pass, same as any forecast anywhere.

## What's precomputed vs. what runs live

**Before the UI ever opens** (`generate_6yr_data.py` → `score_6yr.py`):
1. 6 years of sales data generated (2021–2026, already the cleaned schema) — `bizwiz_6yr_sales_data.csv`.
2. Full backtest: train on 2021–2025, test on 2026, at weekly, monthly, and yearly grain, across all 5 candidates (naive, moving average, linear trend, seasonal-naive, Chronos-2).
3. Whichever model actually won each horizon gets saved to `champions_6yr.json` — this is a real result, not an assumption:

   | Horizon | Winner | Score |
   |---|---|---|
   | Week | Chronos-2 | 16.9% MAPE |
   | Month | Chronos-2 | 9.6% MAPE |
   | Year | Linear trend | +2.0% vs. actual |

   (Different from the earlier 3-year test, where seasonal-naive won "month" — more training history changed the winner, which is exactly why this step has to be re-run periodically, not assumed permanent.)

4. **Stream 2 (LLM as a 6th forecasting candidate) was tested too, fairly, with the same backtest** — Ollama (llama3.2, temperature=0) given the real 2021-2025 history and asked to predict 2026, rolling one step at a time. Result: **lost decisively, and failed outright on the monthly test.**
   - Weekly: completed, but 54.6% MAPE vs. Chronos-2's 16.9% — over 3x worse than the winner, worse than every statistical baseline too.
   - Monthly: after two good-faith fixes (raised timeout 60s→120s, capped output length), it degenerated into repeating the same number ("9333.0") dozens of times in a row instead of forecasting, producing broken output. Diagnosed directly in the Ollama server log — not a guess, an observed failure mode.
   - **Verdict: Stream 2 never became a champion for any horizon.** Kept out of the live app entirely — not by assumption, by the same evidence standard every other candidate had to meet.

## Two real bugs live testing caught (both fixed, both re-verified)

1. **Phrasing drifted the number.** Asked to phrase "94,519," Ollama (default temperature) wrote **95,109** and **102,331** in two separate runs — a genuine, reproducible fabrication in what was assumed to be the "safe" step. Fixed with two layers: `temperature=0` for phrasing, and a hard check (`_number_appears`) that verifies the exact figure literally appears in the output — if it doesn't, the app shows a guaranteed-correct template instead of trusting the sentence. Re-verified: 5/5 clean runs after the fix.

2. **"Year 2026" silently forecast 2027 instead.** The dataset already contains all of 2026, so asking about it isn't a forecast at all — it's a lookup. The app didn't know the difference and answered with a linear-trend projection for the wrong year, unlabeled. Fixed: `answer_question()` now checks whether the named year is already fully covered by the data and returns the real recorded total (`is_actual=True`) instead of running a model. A deeper root cause was found underneath this one: the LLM was also being asked to resolve *relative* phrases ("next year," "this year") into an absolute calendar year, and had no real notion of today's date — it guessed 2026 for "next year" and 2024 for "this year" in the same breath, not even consistent with itself. Fixed by removing the LLM from that job entirely: explicit years are now pulled with a plain regex in code, relative phrases return no year and get resolved against where the data actually ends — the same "don't let the LLM do arithmetic" rule this whole project has followed, now applied to dates too.

3. **Every branch/category/route question got confidently answered with the whole-business number.** "Toronto Central branch revenue," "Vaughan sales," "East GTA Route," "Dairy category" all returned the identical whole-business figure, phrased as if it specifically answered what was asked — the most dangerous kind of bug this project has tried to prevent, a wrong answer that reads as authoritative. Root cause: there is no per-dimension forecasting built at all — nothing checked whether a question named a specific branch/route/category/product before answering. Fixed with `detect_out_of_scope()`: a deterministic keyword match (not LLM-guessed) against the real branch/route/category/product names in the data, plus a fallback for generic dimensional words ("which category...", "Route A" — not even a real route name) and ranking questions. When matched, the app now refuses clearly instead of guessing. Re-verified across 8 mixed questions: 4 correctly refused, 4 correctly answered.

4. **Caught live by the user: 2027, 2029, and 2030 all returned the identical 94,519 forecast.** `answer_question()` only ever checked "is this year already complete in the data" — any year that wasn't fell through to one generic "next year" forecast, no matter how many years out it actually was, and got labeled with whatever year was asked regardless. Root cause was two bugs stacked: the code never validated *how far* the requested year was from the data, and the phrased answer took its year label from the raw question text rather than the computed period — so the sentence would say "2030" while the number underneath was actually 2027's forecast. Fixed by only ever forecasting the single next year immediately after the data (2027) and refusing outright for anything further out, rather than reusing that number under a different label. Re-verified 2025 through 2030: 2025/2026 return real actuals, 2027 forecasts correctly, 2028/2029/2030 all correctly refuse.

5. **Caught live by the user: "what is the net sale AND gross sale in 2025" answered only net sales, silently dropping gross sales.** The code only ever looked at one hardcoded column (`net_sales`); nothing checked which metric(s) a question actually named. Fixed with `detect_metrics()` — matches every metric named (both "net" and "gross" can hit at once), answers each one separately. One consistency rule enforced at the same time: the backtest (`score_6yr.py`) only ever validated **net_sales** — looking up an *actual*, already-recorded value works for any metric (it's a real sum, not a model output), but *forecasting* gross sales or quantity is refused, since there's no evidence a model tuned for net sales transfers to them untested. Verified: "net sale and gross sale in 2025" now correctly returns both (net $78,689 / gross $90,711, gross > net as expected since gross − discount = net); forecasting gross sales for a future period correctly refuses.

6. **Point 4's "refuse anything past 2027" was revisited on explicit request — users should be able to ask about any year.** Rather than refuse, `answer_question()` now runs the champion model however many months ahead are needed to reach the requested year (e.g. 2030 = 48 months ahead, keeping only the last 12 for 2030's total), and pairs the number with an honest, explicit confidence level that degrades with distance: **high** at 1 year ahead (the actual backtested horizon), **moderate** at 2–3, **low** at 4+ — shown as a fixed, code-rendered banner in the UI, not left to the LLM's prose (which is exactly what caused bug #1 in the first place). Chronos-2's native quantiles are surfaced as a real 80% range when the champion is Chronos; linear trend (the actual year-horizon champion) has no native uncertainty, so its forecasts show a confidence label without a numeric range rather than a fabricated one. Verified 2024–2035: actuals unchanged, 2027 still "high confidence," 2028/2029 "moderate," 2030/2035 "low" — each with a genuinely distinct, growing number (94,519 → 102,228 → 109,937 → 117,646 → 156,191), not the same repeated figure.

**Logging expanded** at the same time: every `answer_question()` step (years-ahead calculation, confidence assignment, range extraction) and every `app.py` step (metric results, chart data point counts) now prints to the terminal and the on-page log panel. Also added a defensive guard before every chart render (`series.tail(24).dropna()`, skip the chart entirely if empty) — the likely, though not directly confirmed, cause of the "Infinite extent ... [Infinity, -Infinity]" warning seen in the browser console is an empty/NaN series reaching Streamlit's charting library; this closes that path off going forward even without being able to inspect the live browser session directly.

7. **Caught live by the user: "what will be the revenue of January 2027" returned 94,519 — 2027's whole-YEAR total, not a January figure.** "January" was never extracted anywhere in the code, and the horizon classifier got outvoted by the year number into returning `horizon='year'` instead of `'month'` — the same class of bug as #4 (LLM asked to do date logic it has no grounding for), just triggered by a month name this time instead of a relative phrase. Fixed at the source: `parse_query()` now detects month names directly via keyword matching (all 12 names + common abbreviations) *before* ever calling the LLM for horizon classification — if a month name is found, horizon is set to `'month'` deterministically and the LLM call for horizon is skipped entirely on that path. `answer_question()` gained a matching `target_month` branch (mirrors the year logic exactly: already-recorded month → real actual, no year given → resolves to the next occurrence of that month after the data ends, future month → forecast with `month_confidence_note()`, the month-scaled version of point 6's confidence tiers). Verified: "January 2027" now correctly returns 6,929 (a real month-level forecast, matching the existing "next month" figure) instead of the year total; "March 2025" and "December 2026" (both already in the data) correctly return their own distinct real actuals (6,932 and 9,823); "next month"/"next year" (no explicit month/year) unaffected.

**Every step is now logged** — printed to the terminal running Streamlit (`tail -f /tmp/streamlit_app.log`) and shown directly on the page in an always-open "Steps taken (log)" panel under each answer, so this class of bug is visible without needing to inspect code or a debugger next time.

**When the page is open** (`app.py`), nothing above re-runs. One question in, one answer out:

```
User clicks a sample question, or types their own
                    │
     sample? ───────┴─────── typed?
        │                       │
   horizon already          Ollama parses it
   known (no LLM             into a horizon
   call needed)              (week/month/year)
        └───────────┬───────────┘
                     ▼
      forecasting_core.answer_question(horizon)
       -> looks up the champion for that horizon
       -> runs only that one model on the full
          2021-2026 history
       -> returns the number
                     ▼
       Ollama phrases the number + method into
       2-3 plain sentences (never invents the number)
                     ▼
         Answer + "how this was computed" panel
         + recent-history chart, shown on the page
```

## Files
- `generate_6yr_data.py` — builds the dataset
- `score_6yr.py` — runs the backtest, writes `champions_6yr.json`
- `forecasting_core.py` — loads the champion table, runs whichever model won
- `ollama_client.py` — parse the question, phrase the answer, and `llm_predict` (Stream 2's forecast candidate — tested, did not win, not used live)
- `app.py` — the Streamlit page itself

## To run it
```
source .venv-forecast/bin/activate
ollama serve                    # separate terminal, if not already running
streamlit run app.py
```
Sample-question buttons work even without Ollama running (horizon is already known); typed questions and the phrased answer need Ollama up. Verified live, with Ollama actually running: horizon classification correct on 4/4 test phrasings, full parse → forecast → phrase chain produces an accurate, non-hallucinated answer, and the Streamlit page itself boots clean (HTTP 200).

## The 3-stage flow (as evaluated — Stream 2 tested, not used live)

```
                              USER QUESTION
                     "What will next month's revenue be?"
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   STAGE 1 — OLLAMA             │
                    │   Understand the query          │
                    │   → horizon = "month"           │
                    └───────────────┬───────────────┘
                                    │
                    STAGE 2 — two streams, run in parallel
              ┌─────────────────────┴─────────────────────┐
              ▼                                             ▼
   ┌─────────────────────────┐                 ┌─────────────────────────┐
   │        STREAM 1          │                 │        STREAM 2          │
   │   Statistical / ML pool   │                 │   OLLAMA — predicts       │
   │                           │                 │                           │
   │  • Naive                  │                 │  Reads the same           │
   │  • Moving Average         │                 │  2021-2025 history and    │
   │  • Linear Trend           │                 │  produces its own         │
   │  • Seasonal-Naive         │                 │  forecast number          │
   │  • Chronos-2              │                 │  (temperature = 0, so     │
   │                           │                 │  it's reproducible)       │
   │  each scored on the real  │                 │                           │
   │  2021-2025 → 2026         │                 │  scored the SAME way,     │
   │  backtest → best wins     │                 │  on the SAME held-out     │
   │                           │                 │  2026 data                │
   └─────────────┬─────────────┘                 └─────────────┬─────────────┘
                 │                                              │
                 └───────────────────┬──────────────────────────┘
                                      ▼
                       Compare both real MAPE scores
                                      │
                                      ▼
                       Whichever is more accurate
                            becomes THE number
                                      │
                                      ▼
                    ┌───────────────────────────────┐
                    │   STAGE 3 — OLLAMA             │
                    │   Convert the winning number    │
                    │   into a plain-language answer  │
                    └───────────────┬───────────────┘
                                    │
                                    ▼
                               FINAL ANSWER
```

## Phase 1: cost/profit + branch/route backtests, dynamic (non-regex) question parsing

Four-part request: (1) add cost/profit to the data and retrain, including a first branch+route backtest, (2) test it across scenarios, (3) a context-aware LLM prompt for query understanding, (4) no hardcoded regex — recognition must be dynamic.

### Cost/profit added to the data

`generate_6yr_data.py` and `generate_2027_holdout.py` both gained `unit_cost`/`profit` columns, via a `COST_RATIO_BY_CATEGORY` margin table (e.g. Dairy 0.70, Personal Care 0.55 — realistic spread, not a flat markup). Regenerated both files; the 2027 holdout's byte-identical-reproduction check (see above) still passed against the new schema, so 2027 remains a genuine continuation, not a re-tuned guess.

### Whole-business backtest, now per-metric

`score_6yr.py` rewritten to loop over `METRICS = ["net_sales", "profit"]`, saving nested `champions_6yr.json` (`champions[metric][horizon]`). Real results:

| Metric | Week champion | Month champion | Year champion |
|---|---|---|---|
| net_sales | chronos | chronos | linear_trend |
| profit | chronos | chronos | chronos (+0.9% vs. actual — excellent) |

Nothing else (gross_sales, quantity) has ever been backtested — `forecasting_core.py` refuses those dynamically now (`if not champ`, derived from whether `CHAMPIONS.get(metric, {}).get(horizon)` exists), not via a hardcoded `!= "net_sales"` check.

### Phase 1: branch + route backtest (`score_dimensional.py`, new)

Per-branch and per-route, monthly grain only (density check: ~19 rows/branch/month — weekly would be too thin), same train(2021-2025)/test(2026) split and 5 candidates as the whole-business backtest, net_sales only. Real results, saved to `champions_dimensional.json`:

| Branch | Champion | MAPE | | Route | Champion | MAPE |
|---|---|---|---|---|---|---|
| Brampton | chronos | 39.3% | | Central GTA | linear_trend | 15.8% |
| Mississauga | chronos | 17.8% | | East GTA | seasonal_naive | 27.2% |
| Scarborough | seasonal_naive | 25.5% | | Toronto North | linear_trend | 25.8% |
| Toronto Central | seasonal_naive | 20.7% | | Toronto South | moving_avg | 19.0% |
| Vaughan | linear_trend | 18.3% | | West GTA | linear_trend | 14.2% |

**The finding that matters:** per-dimension accuracy (14–40% MAPE) is meaningfully worse than whole-business (~8–12%). Splitting the same total sales across 5 branches or 5 routes leaves each with a thinner, noisier series — expected, and confirmed rather than assumed. This is why Phase 1 forecasts are scoped tightly: monthly grain only, next-month-ahead only (`DIMENSIONS_WITH_BACKTEST = {"branch", "route"}` in `forecasting_core.py`), net_sales only. Forecasting further out, or profit/category/product/supplier/customer at dimension level, is refused honestly rather than silently extrapolated past what was actually validated — that refusal is driven by absence from `DIMENSIONAL_CHAMPIONS`, not a hardcoded dimension list, so re-running `score_dimensional.py` with a wider scope picks up automatically.

### Regex retired — replaced with two focused, dynamically-sourced LLM calls

Every remaining hand-written regex for understanding a question (`detect_metrics`, `detect_out_of_scope`, the old year/month patterns) is gone. `parse_query()` in `ollama_client.py` now makes two LLM calls, both fed real, live-loaded vocabulary (`DIMENSION_VALUES`, `METRIC_LABELS` from `forecasting_core.py` — pulled from the CSV every call, so a new branch added tomorrow is recognized automatically, nothing to hand-maintain):

1. **`_parse_dates`** — horizon + literal year/month only.
2. **`_parse_dimension_and_metrics`** — which branch/route/category/product/supplier/customer (if any) + which metric(s).

The LLM only ever does **recognition** (fuzzy-matching text against a real, closed, provided list) — never **arithmetic**. Resolving a relative phrase ("next year") into an actual calendar date still happens in `forecasting_core.py`, against the data's own end date.

**First attempt was one combined call, not two — and it failed a 14-question test battery.** Merging dates+dimension+metrics into a single prompt made the small local model (llama3.2, 3B) compulsively fill in a dimension on plain whole-business questions with nothing dimension-related mentioned at all ("what will next month revenue be" → hallucinated `dimension: "customer"`), reproduced the exact previously-fixed bug of guessing an absolute year for a relative phrase ("next year" → `2024`), and — most dangerously — substituted a plausible-but-wrong *real* value for generic or fake mentions instead of returning null ("which branch has the highest revenue" → confidently picked `"Toronto Central"`; a made-up "Route A" → confidently picked `"West GTA Route"`). The exact-match-against-real-list safety net didn't catch the last two, since the substituted values *were* real, just wrong for the question asked.

Fixed by splitting into the two calls above (dimension recognition against 53 real names across 5 lists is the heaviest sub-task — it got worse, not better, sharing a prompt with three other jobs) and adding few-shot examples to the dimension call specifically demonstrating the four failure patterns (nothing mentioned → both null; generic mention → type set, value null; fake name → type set, value null; specific real name → both set). Re-ran the same battery: every flagged failure fixed, confirmed with three extra passes for a follow-up metric-default issue (bare "sales"/"performance" was expanding into multiple metrics instead of defaulting to just `net_sales`) that few-shot examples also resolved. One known, low-severity residual: "performance" alone (no other metric word) still resolves to `profit` for the model, deterministically, even against a direct in-context example to the contrary — likely a strong training-data association. Not fixed further since it's not dangerous: branch-level profit isn't in Phase 1 scope anyway, so it still correctly refuses (`unvalidated_dimension`) rather than returning a wrong number.

Two new safety nets added, mirroring the existing `_number_appears()` pattern (verify the LLM's output against ground truth rather than trust it outright):
- `explicit_year` is only kept if those literal digits actually appear in the question text.
- `dimension_value` is only kept if it's an exact match in the real, live-loaded list for that dimension.

### `app.py` rewired for the new `parse_query()` shape and dimensional answers

`parse_query()`'s return changed from a 3-tuple to a 6-key dict (`horizon`, `explicit_year`, `explicit_month`, `dimension`, `dimension_value`, `metrics`); `detect_out_of_scope`/`detect_metrics` no longer exist. `app.py`'s question-handling block was rewritten around the new shape:
- Sample-question buttons dropped the `forced_horizon` shortcut (dimension/metric detection now needs an LLM call regardless of whether horizon is already known from a button, so the shortcut no longer saves a full round-trip) — every question, typed or button-clicked, now goes through the same single `parse_query()` path.
- Two Phase 1 sample buttons added ("What will `{branch}` branch's sales be next month?", "How is the `{route}` performing?") — the name is pulled from `DIMENSION_VALUES` at render time, not hand-typed, so it's always a real, current value.
- New explicit refusal when a dimension is recognized but no specific real value is: covers both a generic/ranking question ("which branch has the highest revenue") and an unrecognized name ("Route Z") — previously this would have silently fallen through and answered at the whole-business level, quietly answering a different question than the one asked.
- Three dynamically-worded refusal messages for `answer_question()`'s `out_of_range` result, one per actual reason (`unvalidated_dimension` — split further into "dimension not in Phase 1 at all" vs. "dimension is in Phase 1 but this metric isn't"; `dimension_forecast_out_of_range` — forecast requested beyond next month; plain `unvalidated_metric` — no backtest at any level), each built from `CHAMPIONS`/`DIMENSIONAL_CHAMPIONS`/`DIMENSIONS_WITH_BACKTEST` at render time rather than one fixed hardcoded sentence (the old single message had gone stale the moment profit became validated).

### Extending the genuine 2027 holdout test to profit and Phase 1 (`validate_2027_phase1.py`, new)

`validate_2027.py` (whole-business net_sales vs. real 2027) predates cost/profit and Phase 1 — never checked either. Same principle, extended: train only on 2021-2026, forecast, compare to `bizwiz_2027_holdout_ACTUAL.csv`, which the model has never seen.

**Whole-business profit**: chronos wins on the real 2027 holdout too (10.0% monthly MAPE), full-year diff only −0.3% (24,608 predicted vs. 24,525.5 actual) — confirms the 2021-2025→2026 backtest's choice generalizes, same as net_sales did.

**Phase 1 branch/route**: this is the finding that matters. On genuine 2027 data, **9 of the 10 branch/route champions got *worse*, not just similar**, compared to what the 2021-2025→2026 backtest predicted:

| Value | 2026 backtest MAPE | Real 2027 MAPE |
|---|---|---|
| Brampton | 39.3% | 23.2% (better) |
| Mississauga | 17.8% | 28.9% |
| Scarborough | 25.5% | 42.3% |
| Toronto Central | 20.7% | 23.2% |
| Vaughan | 18.3% | 29.6% |
| Central GTA Route | 15.8% | 41.2% |
| East GTA Route | 27.2% | 28.8% |
| Toronto North Route | 25.8% | 36.7% |
| Toronto South Route | 19.0% | 31.2% |
| West GTA Route | 14.2% | 33.3% |

A single train/test split (2021-2025→2026) picking a champion per branch/route does not reliably predict how that champion performs on a *second* unseen year — most land in the 23–42% MAPE range on real 2027 data, worse than the already-mediocre range the one backtest suggested. Whole-business (net_sales and now profit) held up well on the same genuine holdout; dimensional (branch/route) did not. This reinforces, with a second independent piece of evidence, why Phase 1 is scoped as tightly as it is (monthly, next-month-only, net_sales only) and treated as lower-confidence than the whole-business numbers — the risk flagged when Phase 1 was first built is now confirmed on truly unseen data, not just theorized from the density check.

### Scenario test (12 cases, exercising `parse_query → answer_question` exactly as `app.py` composes them)

All 12 passed: whole-business net_sales/profit forecast correctly; whole-business gross_sales/quantity correctly refuse (`unvalidated_metric`, never backtested); branch/route Phase 1 forecasts produce a real next-month number with correct `(dimension=value)` labeling; a past-year branch lookup correctly returns the recorded actual (`is_actual=True`, no model run) instead of forecasting something already known; branch-level profit correctly refuses as `unvalidated_dimension` (in Phase 1 scope, wrong metric); category-level sales correctly refuses as `unvalidated_dimension` (dimension outside Phase 1 scope entirely); a branch forecast far beyond next month (2028) correctly refuses as `dimension_forecast_out_of_range`; the generic ranking question and the fake route name both correctly hit the app-level "name a specific one" refusal rather than silently answering at the wrong scope.

### Two follow-up `parse_query()` bugs, found live

Same category of issue as before, caught by an actual question asked in the UI: "give me the Brampton branch revenue in 2027" came back with **three** duplicate answers (net_sales/gross_sales/profit) all labeled "January 2027," despite no month being mentioned. Root causes, both fixed:
1. `explicit_month` had no safety net verifying the month was actually in the text (unlike `explicit_year`, which already had one) -- fixed by adding the same check, scanning every known spelling of the candidate month rather than just the LLM's returned string.
2. Combining a dimension name + a year with "revenue" specifically (not "revenue" alone, and not paired with just a dimension or just a year) made the model expand to multiple metrics, once even dropping `net_sales` for `gross_sales` alone. A few-shot example fixed the exact phrasing but didn't generalize across branch/route names -- fixed properly with a code-level check mirroring the prompt's own stated rule: each non-default metric (`gross_sales`, `profit`, `quantity`) is only kept if its specific trigger word literally appears in the question text.

### Model Playground -- direct parameter testing, bypasses the LLM and the validation gate entirely

New UI section, separate from the Q&A flow, for directly probing `ALL_MODELS` (especially Chronos) with hand-picked parameters -- no question to parse, and no `DIMENSIONS_WITH_BACKTEST`/`CHAMPIONS` gating, so it runs on combinations never backtested (e.g. `cost` -- a new derived `quantity × unit_cost` metric, kept in a playground-only `PLAYGROUND_METRIC_COLUMNS`, deliberately never merged into `METRIC_COLUMNS` -- and category/product/supplier, none of which have Phase 1 backtests).

Dimension-value and year/month fields are plain text, not dropdowns, specifically so bad input can actually be typed and tested rather than being prevented by the widget. Handles, by design (not by accident):
- Gibberish, empty, or cross-dimension values (a category name typed while "branch" is selected) -- validated against that dimension's real list only, case-insensitive, whitespace-tolerant.
- Multiple years/months in one field (e.g. "2021, 2024, 2025") -- explicitly detected and rejected, not silently truncated to the first value.
- Non-numeric, decimal, zero/negative, or absurdly large years -- rejected with a specific reason.
- A target period already in the data -- rather than refusing, runs a genuine ad-hoc backtest: every candidate trains only on data strictly before that period, then is compared against the real recorded value.
- A target period far beyond the data (capped at ~10 years/120 periods) -- rejected rather than left to hang.
- Insufficient history for one candidate (e.g. `seasonal_naive` needing 12 points it doesn't have) -- caught per-candidate, so one failure doesn't take down the others.

**Bug caught building this:** the first version computed "how many periods ahead" as `(target_date - last_date) / pd.DateOffset(months=1)` -- pandas can't divide a `Timedelta` by a `DateOffset` (a month has no fixed length), so every year/month-targeted request crashed. Fixed with explicit calendar-unit counting (`(target.year - start.year) * 12 + (target.month - start.month)` for months, day-count/7 for weeks), the same pattern `answer_question()` already used elsewhere in this file -- just hadn't been reused here yet.

### Model Playground: MAPE, for actually comparing models

Added two MAPE columns to the results table, sourced two different ways:
- **MAPE (this test)** -- computed only when the target period is already in the data, across *every* period requested (not just the final one). Fixing this properly surfaced a related design gap: a month-level target always truncated training to exactly one step before it, so periods_ahead was always 1 -- multi-period MAPE could never actually fire. Fixed by changing what "year only, no month" means: it now truncates training to the end of the *prior* year and forecasts all 12 months, matching how "year" already works everywhere else in this app (a full year, not just its December), and giving a genuine 12-point backtest to compare against. A specific month stays a single-point target, unchanged.
- **Historical MAPE** -- the real per-model score from `score_6yr.py`/`score_dimensional.py`'s actual 2021-2025→2026 backtest (`champions_6yr.json`'s `results`, `champions_dimensional.json`'s `scores` -- both already had every candidate's score on disk, just not surfaced before now), shown even for a genuinely future target with no ground truth to live-test against, so there's always something real to compare against. Blank (not zero, not guessed) for combinations that were never backtested at all, like `cost`.

Rows sort best-first by whichever MAPE is actually available (live takes priority over historical), with unscored/failed rows sinking to the bottom rather than sorting arbitrarily.

## Full data-source pivot: BizWiz synthetic data → real medical sales data

Replaced the foundation everything else was built on: `medical_sales_5yr_250k.csv` (250,000 rows, 2021-2025, real-shaped data given to the project rather than generated by it) in place of the old synthetic BizWiz distribution data.

**Archived, not deleted** (no git repo here, so no undo if this went wrong) -- `archive_bizwiz_synthetic/` now holds the old training data, holdout, both champion JSONs, every generator script, and every other leftover artifact from the BizWiz-era work (including pre-6yr scratch files like `bizwiz_3yr_sales_data.csv` that predated even that). Nothing active reads from any of it anymore, but it's one `mv` away from coming back if wanted.

**This is given data, not generated data** -- a real, meaningful shift in workflow. There's no `generate_*.py` step anymore (nothing to control the generation process of), which also means no genuine *future* holdout the way `bizwiz_2027_holdout_ACTUAL.csv` was (a year built from the same seed, never trained on, existing purely to check generalization). The best available rigor now is the standard train/test split -- 2021-2024 train, 2025 test, the only full held-out year this data has. If a genuinely later period (an actual 2026) becomes available eventually, that same holdout-validation methodology could come back; until then this is an honest, slightly weaker guarantee than before, not something to paper over.

### Density check first, scope decided from it (`eda_medical.py`, new)

Same principle as the very first BizWiz density analysis: check rows-per-dimension-value-per-month *before* deciding what's forecastable, don't assume. This data is far richer:

| Dimension | Values | Avg rows/month/value | Verdict |
|---|---|---|---|
| customer_type | 5 | 833 | Solid |
| product_type | 7 | 595 | Solid |
| branch | 15 | 278 | Solid (14x denser than old branch data) |
| category | 15 | 278 | Solid |
| route | 30 | 139 | Solid (7x denser than old) |
| supplier | 30 | 139 | Solid |
| product | 200 | 21 (min 3) | Borderline -- same density as the old branch/route data that only barely worked. Tested anyway, scored honestly. |
| customer | 500 | 8 (min 1) | Not viable -- excluded from backtesting entirely, now confirmed by data rather than assumed. |

This directly expands scope from the old "branch + route only" to seven dimensions.

### Whole-business backtest (`score_whole_business.py`, replaces `score_6yr.py`)

Train 2021-2024, test 2025, same 5 candidates, same two metrics (net_sales, profit). Chronos wins every single horizon on both metrics:

| Metric | Week | Month | Year |
|---|---|---|---|
| net_sales | chronos (4.7% MAPE) | chronos (2.9% MAPE) | chronos (+1.2% vs. actual) |
| profit | chronos (5.1% MAPE) | chronos (2.9% MAPE) | chronos (+1.6% vs. actual) |

Notably more accurate than the old BizWiz whole-business numbers (was ~8-12% monthly MAPE) -- expected, given a real 250K-row dataset carries a cleaner signal than a smaller synthetic one.

### Dimensional backtest (`score_dimensional.py`, same filename, fully rewritten)

Monthly grain, net_sales only, across all seven dimensions the density check cleared for testing. Saved to `champions_dimensional.json`.

| Dimension | Values scored | Avg champion MAPE |
|---|---|---|
| customer_type | 5 | 6.6% |
| product_type | 7 | 7.5% |
| category | 15 | 9.7% |
| branch | 15 | 10.6% |
| supplier | 30 | 12.7% |
| route | 30 | 13.0% |
| product | 200 | 32.0% |

A dramatic improvement over the old BizWiz dimensional numbers (14-42% MAPE across the board, worse than whole-business) -- every dimension here except `product` now sits close to whole-business accuracy (2.9-4.7%), some (`customer_type`, `product_type`) nearly matching it. `product` is the clear outlier, exactly as the density check predicted (21 avg rows/month/value, right at the old "barely viable" bar) -- included and scored honestly rather than excluded, but meaningfully less trustworthy than the other six. This is a direct, empirical confirmation that the earlier "dimensional accuracy degrades with thinner data" finding was about *density*, not something inherent to forecasting below the whole-business level -- given enough rows per slice, dimensional forecasts hold up close to whole-business quality.

### Prompt updates (`ollama_client.py`)

`product` grew from 20 (old data) to 200 values -- too large to include verbatim in `parse_query`'s dimension prompt (same reasoning that already excluded `customer`'s 120/500 IDs). `product` is now recognized as a dimension type but its `dimension_value` always resolves to `null` *unless* the user's question already contains the exact real string verbatim (the safety net still verifies it against the real list -- it just can't be recalled from a list that was never shown). Confirmed with three adversarial cases: a real product number gets recognized (`"Medical Product 0088"`, was in the question exactly), while an out-of-range number, a malformed one (missing a digit), and a made-up name all correctly resolve to `null` rather than a hallucinated substitute.

`product_type` and `customer_type` added as new first-class dimension types, with their small (7 and 5 value) lists shown verbatim -- both few-shot examples and validation logic extended accordingly.

### Full re-test (parse_query battery + 15-scenario end-to-end battery)

Both re-run against real medical-domain values (`Medical Branch 05`, `Route 12`, `Cardiovascular`, `Tablet`, `Hospital`, etc.) rather than assumed to still work. All passed, including the three brand-new dimension types (`category`, `product_type`, `customer_type`) working end-to-end for the first time, actual-vs-forecast distinction, the wrong-metric-for-dimension refusal, the beyond-next-month refusal, and all three "no specific value" refusal paths (generic ranking, fake route number, customer with no list at all).

### Cleanup

Every old BizWiz-era file -- training data, holdout, both champion JSONs, every generator/scoring script, and pre-6yr scratch files that predated even those -- moved into `archive_bizwiz_synthetic/`, not deleted. `app.py`'s title, caption, and every user-facing refusal message updated to drop the stale "Phase 1 covers branch/route only" and "2021-2025→2026" framing, which is no longer accurate now that scope is seven dimensions on a 2021-2024→2025 backtest.

## Model Playground bug: "Year: 2026" was silently only December 2026

Caught live, from a screenshot: typing `2026` into the Year field (no month) showed "Target: December 2026" and a single month's predicted value -- while the rest of the app already treats a bare year as the *full year, summed* (`answer_question()`'s year branch, and `score_whole_business.py`'s own year-level backtest both sum 12 months). The Playground was inconsistent with its own app's convention, and confusing on its own terms -- nobody typing "2026" expects to be shown one specific month.

Fixed in `run_playground_forecast()`: a year-only target now returns the **sum of all 12 months** as each candidate's predicted value (not `pred[-1]`), and the backtest case's `actual_value` is the real year's summed total, not December's single recorded figure. The accuracy statistic for a year-only backtest also changed to match -- "% off on the summed annual total" (score_whole_business.py's own `diff_pct` statistic), not a mean of 12 separate monthly MAPEs, which can look worse than the total actually is when some months are over-predicted and others under-predicted and they net out. A specific month target (`year` + `month` both given) is unchanged -- that's still, correctly, a single point.

Verified against numbers already established earlier in this conversation: year=2026 (future) now shows chronos's total as 37,743,672 (matches the earlier whole-business 2026 forecast, +1.5% vs. 2025); year=2025 (backtest) shows chronos's live MAPE as 1.2% (matches the earlier-found year-level diff for the real 2021-2024→2025 backtest exactly).

**Actual outcome:** Stream 2 lost every horizon it was tested on (see point 4 above), so in the live app today the "compare both scores" step always resolves to Stream 1's winner — Chronos-2 or linear trend, never the LLM's own guess. The architecture still supports Stream 2 competing; it just hasn't earned a place yet.