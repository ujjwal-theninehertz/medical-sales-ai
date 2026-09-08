# TTM / Chronos Forecast Testing — Process

## 1. Data analysis — `bizwiz_1000_sales_data.csv`

- **1,000 rows, 23 columns.** Line-item sales: date, branch, route, product, customer, qty, price, discount, gross/net sales, stock before/after, status.
- **Date range:** 2025-01-01 → 2026-08-31 — 608 calendar days (~20 months), and every single day has at least one transaction (no full date gaps).
- **5 branches:** Toronto Central, Mississauga, Brampton, Vaughan, Scarborough — fairly even (181–217 rows each).
- **5 routes, 20 products.**
- **Status:** 943 Completed, 40 Returned, 17 Cancelled. Returned/Cancelled rows already carry `net_sales = 0`, so **`net_sales` is safe to forecast directly** — no extra filtering needed. If you ever forecast `quantity` or `gross_sales` instead, filter to `sales_status == "Completed"` first, or those will overcount.
- **Density check:** ~1.6 transactions/day across the whole business, ~0.3/day per branch. Too sparse to forecast daily-per-branch yet — start at whole-business level, weekly buckets.

## 2. What this test forecasts

| Setting | Value |
|---|---|
| Metric | `net_sales` |
| Level | whole business (all branches combined) |
| Frequency | weekly totals |
| Split | chronological, **not random** |

Weekly, not monthly: monthly only gives ~20 points — too thin. Weekly resamples to 88 points; the first and last are **partial weeks** (data starts mid-week Jan 1 2025, ends mid-week Aug 31 2026) and get trimmed, leaving **86 clean full weeks**.

Split size was set to match, not guessed: TTM's public checkpoints only support fixed (context, horizon) pairs — the smallest is context=52/horizon=16. So the split is **70 train weeks / 16 test weeks** (≈81/19, not exactly 80/20) — chosen to line up with a real, natively-supported checkpoint instead of forcing an arbitrary ratio TTM would have to be zero-padded or rolled to fit.

**EDA before touching any model** (see `eda.py`, `eda_trend.png`) — the findings that shaped the above:
- No nulls/duplicates outside the expected `offer` column; no negative prices/quantities.
- 68 rows (6.8%) are IQR-flagged "outliers" — all on the high side (large legitimate bulk orders), not errors — left in.
- Cancelled/Returned confirmed to always carry `net_sales = 0` — verified across all 57 such rows, not just a sample.
- Daily whole-business signal is choppy (CV 0.81); weekly is much smoother (CV 0.30) — confirms weekly is the right starting grain.
- **Trend is nearly flat**: first-half vs second-half weekly mean is only +2.0% over the full ~20 months.
- Month-of-year averaging hints at a May bump, but that's only 2 yearly cycles — not enough to call it real seasonality yet.
- Per-branch density (~2.3 rows/branch/week) and per-product density confirm branch/product-level forecasting isn't viable yet — whole-business is the correct scope for now.

## 3. Step-by-step process

1. Load the CSV.
2. Group by week, sum `net_sales` → one clean weekly series.
3. Split chronologically: earliest 80% = train, most recent 20% = test (held out, never shown to the model).
4. `run_forecast("ttm", train_series, horizon=len(test))` → predicted weekly values + confidence range.
5. Compare predictions to the real held-out weeks → score with MAPE (mean % error).
6. Run a seasonal-naive / moving-average baseline through the same comparison, for reference.
7. Record the result.
8. Repeat steps 4–7 with `run_forecast("chronos", ...)` — same train/test data, same scoring, only the model name changes.
9. Compare TTM's score vs. Chronos's score vs. the baseline's score — lowest MAPE wins.

## 3b. Result — actually run (`forecast_test.py`, zero paid API cost)

| Model | MAPE | MAE |
|---|---|---|
| naive (last value) | 80.6% | 362.0 |
| moving average (8 wk) | 23.0% | 115.4 |
| linear trend | 22.8% | 115.6 |
| TTM | 23.6% | 110.7 |
| **Chronos-2** | **21.2%** | **107.4** |

**Chronos-2 wins** — best MAPE and best MAE of all five candidates, a real (if modest) edge over both TTM and the simple baselines. TTM itself only ties the baselines, consistent with the EDA: a nearly-flat, noisy series with no confirmed strong seasonality is exactly the situation where a pretrained model doesn't automatically beat "take the recent average" — Chronos-2 clearing that bar, even by a small margin, is the meaningful result here, not TTM's tie.

Both models' outputs were re-run twice and diffed byte-for-byte to confirm they're deterministic before trusting the comparison — no hidden run-to-run randomness in either.

Implementation notes worth keeping:
- **TTM**: `get_model()` auto-selected a *frequency-tuned* checkpoint (`52-16-ft-r2.1`), which requires passing a properly-fitted `TimeSeriesPreprocessor` as the pipeline's `feature_extractor` — a bare `freq="W"` string isn't enough and throws a clear error.
- **Chronos**: used `amazon/chronos-2` (released June 2026), the newest release — chosen over Chronos-Bolt and the original Chronos-T5 line. Unlike TTM, it has no fixed context/horizon checkpoint puzzle — `predict_df` takes any history length and any `prediction_length` directly, which made the integration noticeably simpler than TTM's.

## 3c. Decomposition ("why") — actually run (`decomposition_test.py`)

The other half of the Intelligence engine, untested until now. Real example: **July 2026 vs June 2026, a genuine -12.4% decline** (2210.18 → 1936.68), filtered to `sales_status == "Completed"` for consistency with `net_sales`.

| Question | Answer |
|---|---|
| Was quantity lower? | Yes — 265 → 236 units (-10.9%) |
| Was price lower? | Barely — avg unit price -0.9%, not the driver |
| Did product mix change? | Yes, significantly — Toothpaste, Laundry Detergent, Dishwashing Liquid all dropped hard; Wheat Flour, Pasta, Coffee, Potato Chips are new in July and partly offset the decline |
| Did discounts increase? | No — total discount $ actually fell slightly; not the cause |

**Honest caveat:** the same-product volume/price waterfall only explained ~129% of the actual change (residual +79.4 on a -273.5 total, ~29%) — the per-product numbers are noisy because each product only has a handful of transactions per month (~2.35 avg), the same sparsity the EDA flagged for branch/product-level analysis. Directionally reliable (quantity down, mix shifted, discounts not to blame); the exact dollar split per effect shouldn't be trusted to the decimal on data this thin.

## 3d. Near-term forecast — actually run (`next_period_forecast.py`, Chronos-2)

| Question | Forecast | 80% range |
|---|---|---|
| Next week (wk of 2026-09-06) | 487.8 | 336.5 – 696.0 |
| Next month (Sep 2026) | 2214.3 | 1774.5 – 2778.7 |

## 3e. 3-year dataset — `bizwiz_3yr_sales_data.csv` (generated, `generate_3yr_data.py`)

The 1,000-row sample only covered ~20 months with a near-flat trend — not enough to properly test yearly seasonality. Generated a 3,040-row, 3-year (2024–2026) synthetic set on the same schema, with a **real, repeating month-of-year seasonality** (Dec peak, Feb trough, same shape every year) plus ~8%/yr growth baked in on purpose, so there's an actual pattern to learn — not just noise.

**Test: train on 2024+2025 (24 months), test on all of 2026 (12 months)** — `forecast_3yr_test.py`.

| Model | MAPE | MAE |
|---|---|---|
| naive (last value) | 21.3% | 1051.1 |
| moving average (3mo) | 19.4% | 966.1 |
| **seasonal-naive (repeat 2025)** | **11.1%** | **599.3** |
| Chronos-2 | 13.1% | 693.9 |

**Seasonal-naive won this time** — "just repeat the same month from last year" beat Chronos-2. Not a contradiction of the earlier result, a different lesson: this dataset has *very* regular, repeating seasonality by construction, which is exactly the situation where a dead-simple seasonal baseline is hard to beat with only 2 years of history to learn from. Chronos-2 still clearly beat the flat baselines and its 80% confidence range covered 11/12 real months — but it visibly under-predicted the December peak both times (worst miss: -29.5% in Dec 2026), suggesting it under-weighted how much the holiday peak was still growing year over year.

**Yearly grain — checked, not really testable:** only 2 yearly training points exist (2024: 49,352 → 2025: 57,244 → 2026: 62,752 actual). Any model "forecasting" from 2 points is just drawing a line through them — shown for reference only, not treated as a real backtest.

**"Next month" and "next year" specifically, asked from the 2024-2025 → 2026 boundary:**

| Question | Chronos-2 predicted | Actual | Diff | Seasonal-naive predicted | Diff |
|---|---|---|---|---|---|
| Next month (Jan 2026) | 5685.8 | 5121.2 | -11.0% | 3633.9 | +29.0% |
| Next year (all 2026, summed) | 64145.3 | 62752.3 | **-2.2%** | 57244.2 | +8.8% |

The split result explains itself once you see both: seasonal-naive nails a single month's *shape* better on average (11.1% MAPE), but it has no concept of growth — it just replays 2025, so it undershoots the full-year total by 8.8%. Chronos-2 misses individual months by more but tracks the underlying trend, so its errors roughly cancel out over 12 months — landing within 2.2% of the real 2026 total. **Practical takeaway: seasonal-naive for a single month's number, Chronos-2 for a "how will this year turn out" question** — not one universal winner, the right model depends on which question is actually being asked.

Genuine forward forecasts (not backtests — September hasn't happened yet), using the full 86-week / 20-month history as context. Note the range is wide relative to the point forecast — an honest reflection of how noisy this series is, not a defect in the model.

## 4. Intentionally left out of this test

- **No LLM (Ollama or otherwise).** Metric, level, frequency, and split are all set manually in the script — the LLM's job (extracting these from a question) isn't being tested here.
- **No query engine.** The CSV is loaded directly since it's a static file, not a live database — the query engine matters once BizWiz's real DB is connected.
- **No per-branch or per-product forecasting yet** — that's the next step once the whole-business result is validated.

## 5. After this test

1. Whichever model wins becomes the default inside `run_forecast()`.
2. Layer Ollama on top — it parses a question like "what will next year's revenue be" into the same parameters this test set manually.
3. Swap the CSV loader for the real query engine once BizWiz database access is available.
