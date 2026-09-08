"""Full-YEAR backtests per dimension value, on the new medical dataset -- net_sales only,
same 302 values as score_dimensional.py, same train(2021-2024)/test(2025) split, but scored
differently: this asks every candidate for 12 months ahead and sums them into a year total,
then compares that total against the real 2025 year total (diff %) -- the same methodology
score_whole_business.py already uses for its own year rollup, just applied per dimension value
instead of whole-business.

Why this is a SEPARATE script and a separate champion table, not a change to
score_dimensional.py: that script's existing champion answers "which model is most accurate
month-to-month for this value" (mean error across 12 individual months) -- a genuinely
different question from "which model gets the value's ANNUAL TOTAL closest" (one number, over-
and under-predicted months can cancel out). A value can have -- and several do, see
score_whole_business.py's own net_sales month vs year champions differing -- a different
winner for each question. forecasting_core.py keeps both tables and picks the one that
matches what was actually asked (next month vs a specific year).

This is what unlocks "what will Cardiovascular category sales be in 2026" -- previously refused
outright (dimensional forecasting had only ever been validated for next-month), now answerable
wherever a value has a validated year-level champion, using the same confidence-decay logic
(confidence_note() in forecasting_core.py) whole-business already applies the further out you ask.
"""
import json
import numpy as np
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from llm_client import llm_predict
from forecasting_core import METRIC_LABELS

df = pd.read_csv("medical_sales_5yr_250k.csv", parse_dates=["sales_date"])
CANDIDATES = ["naive_last_value", "moving_avg", "linear_trend", "seasonal_naive", "chronos"]
LLM_CANDIDATE = "claude-haiku-4-5"
TRAIN_END, TEST_START, TEST_END = "2024-12-31", "2025-01-01", "2025-12-31"
METRIC_LABEL = METRIC_LABELS["net_sales"]  # net_sales-only, matching score_dimensional.py's own scope

DIMENSIONS = [
    ("branch", "stock_branch"), ("route", "route"), ("category", "category"),
    ("product_type", "product_type"), ("customer_type", "customer_type"),
    ("supplier", "supplier"), ("product", "product"),
]


def run_forecast(model_name, train_series, horizon, freq="MS"):
    """Verbatim copy of score_dimensional.py's local-candidate logic -- kept identical so a
    value's local-model predictions here are the same numbers that script already validated,
    not a second, potentially-drifted implementation."""
    if model_name == "naive_last_value":
        return np.full(horizon, train_series.iloc[-1])
    if model_name == "moving_avg":
        return np.full(horizon, train_series.iloc[-3:].mean())
    if model_name == "linear_trend":
        x = np.arange(len(train_series))
        slope, intercept = np.polyfit(x, train_series.values, 1)
        fx = np.arange(len(train_series), len(train_series) + horizon)
        return slope * fx + intercept
    if model_name == "seasonal_naive":
        return train_series.iloc[-12:-12 + horizon].values[:horizon] if horizon < 12 else train_series.iloc[-12:].values
    if model_name == "chronos":
        from chronos import Chronos2Pipeline
        input_df = pd.DataFrame({"item_id": "business", "timestamp": train_series.index,
                                  "target": train_series.values})
        pipe = Chronos2Pipeline.from_pretrained("amazon/chronos-2")
        out = pipe.predict_df(input_df, prediction_length=horizon, freq=freq)
        return out["predictions"].values[:horizon]
    raise ValueError(model_name)


def split_for(sub_df):
    monthly = sub_df.set_index("sales_date").resample("MS")["net_sales"].sum()
    full_index = pd.date_range(monthly.index.min(), monthly.index.max(), freq="MS")
    monthly = monthly.reindex(full_index, fill_value=0.0)
    train, test = monthly.loc[:TRAIN_END], monthly.loc[TEST_START:TEST_END]
    if len(test) < 12 or train.sum() == 0:
        return None
    return train, test


# ---- Pass 1: build the job list + local candidates' year totals (fast, sequential) ----
jobs = []
for dim, col in DIMENSIONS:
    print(f"\n{'='*70}\nDIMENSION: {dim}\n{'='*70}")
    for value in sorted(df[col].unique()):
        sub = df[df[col] == value]
        s = split_for(sub)
        if s is None:
            continue
        train, test = s
        actual_year = float(test.values.sum())
        predicted, diff_pct = {}, {}
        for name in CANDIDATES:
            try:
                pred = run_forecast(name, train, 12)
                pred_year = float(np.sum(pred))
                predicted[name] = round(pred_year, 1)
                diff_pct[name] = round((actual_year - pred_year) / actual_year * 100, 1)
            except Exception as e:
                print(f"    [{name} failed for {dim}={value}: {type(e).__name__}: {e}]")
        local_champ = min(diff_pct, key=lambda k: abs(diff_pct[k])) if diff_pct else None
        print(f"  {value:<24} actual={actual_year:,.0f}  local-best={local_champ} "
              f"({diff_pct.get(local_champ, '?')}%)")
        jobs.append({"dim": dim, "value": value, "train": train, "actual_year": actual_year,
                      "predicted": predicted, "diff_pct": diff_pct})

print(f"\n{len(jobs)} dimension values to test at YEAR grain (expect 302, matching score_dimensional.py)")

# ---- Pass 2: LLM candidate, in parallel (network-bound; everything above is free/local) ----
print(f"\n{'='*70}\nRunning {LLM_CANDIDATE} (12-month-ahead, summed to a year) for all "
      f"{len(jobs)} values IN PARALLEL...\n{'='*70}")


def score_llm(job):
    try:
        preds = llm_predict(list(job["train"].values), 12, "monthly", metric_label=METRIC_LABEL,
                             dimension=job["dim"], dimension_value=job["value"], log_fn=lambda m: None)
        pred_year = float(np.sum(preds))
        diff = round((job["actual_year"] - pred_year) / job["actual_year"] * 100, 1)
        return job["dim"], job["value"], round(pred_year, 1), diff
    except Exception as e:
        print(f"    [{LLM_CANDIDATE} failed for {job['dim']}={job['value']}: {type(e).__name__}: {e}]")
        return job["dim"], job["value"], None, None


done = 0
with ThreadPoolExecutor(max_workers=8) as pool:
    futures = {pool.submit(score_llm, job): job for job in jobs}
    for future in as_completed(futures):
        job = futures[future]
        dim, value, pred_year, diff = future.result()
        done += 1
        if pred_year is not None:
            job["predicted"][LLM_CANDIDATE] = pred_year
            job["diff_pct"][LLM_CANDIDATE] = diff
        if done % 25 == 0 or done == len(jobs):
            print(f"  ...{done}/{len(jobs)} done")

# ---- Merge + save ----
results = {}
llm_wins = []
for job in jobs:
    results.setdefault(job["dim"], {})
    champion = min(job["diff_pct"], key=lambda k: abs(job["diff_pct"][k]))
    results[job["dim"]][job["value"]] = {
        "champion": champion, "actual": round(job["actual_year"], 1),
        "predicted": job["predicted"], "diff_pct": job["diff_pct"],
    }
    if champion == LLM_CANDIDATE:
        llm_wins.append(f"{job['dim']}={job['value']} ({job['diff_pct'][champion]:+.1f}%)")

with open("champions_dimensional_yearly.json", "w") as f:
    json.dump(results, f, indent=2)
print("\nSaved -> champions_dimensional_yearly.json")

print("\n" + "=" * 70)
print("SUMMARY (champion counts per dimension)")
print("=" * 70)
for dim, values in results.items():
    counts = {}
    for info in values.values():
        counts[info["champion"]] = counts.get(info["champion"], 0) + 1
    print(f"  {dim:<14} {len(values)} values -- {counts}")

print(f"\n{LLM_CANDIDATE} won {len(llm_wins)} of {len(jobs)} dimension values at YEAR grain:")
for w in llm_wins:
    print(f"  {w}")
