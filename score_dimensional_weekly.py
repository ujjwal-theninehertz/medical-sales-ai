"""WEEKLY backtests per dimension value -- net_sales only, same population as
score_dimensional.py (302 values, if the data supports it at this grain), same
train(2021-2024)/test(2025) split, but resampled weekly and scored the same way
score_dimensional.py already scores monthly: MAPE across every real week of 2025, not a
single year-total number (that's what score_dimensional_yearly.py does).

Weekly is expected to be the hardest grain -- confirmed already at whole-business level
(chronos 4.7% weekly vs 2.9% monthly; claude-haiku-4-5 50.4% weekly vs 3.1% monthly) --
and thinner here: a single branch/route/category is a slice of an already-modest dataset,
and an individual product's WEEKLY volume can be a handful of units. The len(test) < 52
skip (vs score_dimensional.py's < 12) is deliberately much stricter, matching a full year
of weekly data rather than monthly -- a value simply doesn't get a weekly champion if
there isn't enough weekly history to judge one honestly. That absence is what
answer_question() checks -- no forced, low-confidence weekly champion for a thin value.
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
METRIC_LABEL = METRIC_LABELS["net_sales"]
CYCLE = 52     # weekly seasonal_naive lookback -- matches forecasting_core.run_forecast's own W-branch
MA_WINDOW = 8  # weekly moving_avg window -- same as forecasting_core.run_forecast's own W-branch (score_dimensional.py's
               # 3-period window is monthly-tuned and wrong for weekly, so this is NOT copied from that file)

DIMENSIONS = [
    ("branch", "stock_branch"), ("route", "route"), ("category", "category"),
    ("product_type", "product_type"), ("customer_type", "customer_type"),
    ("supplier", "supplier"), ("product", "product"),
]


def mape(actual, pred):
    actual, pred = np.asarray(actual), np.asarray(pred)
    return np.mean(np.abs((actual - pred) / actual)) * 100


def run_forecast(model_name, train_series, horizon):
    if model_name == "naive_last_value":
        return np.full(horizon, train_series.iloc[-1])
    if model_name == "moving_avg":
        return np.full(horizon, train_series.iloc[-MA_WINDOW:].mean())
    if model_name == "linear_trend":
        x = np.arange(len(train_series))
        slope, intercept = np.polyfit(x, train_series.values, 1)
        fx = np.arange(len(train_series), len(train_series) + horizon)
        return slope * fx + intercept
    if model_name == "seasonal_naive":
        end = -CYCLE + horizon
        return train_series.iloc[-CYCLE:end if end < 0 else None].values[:horizon]
    if model_name == "chronos":
        from chronos import Chronos2Pipeline
        input_df = pd.DataFrame({"item_id": "business", "timestamp": train_series.index,
                                  "target": train_series.values})
        pipe = Chronos2Pipeline.from_pretrained("amazon/chronos-2")
        out = pipe.predict_df(input_df, prediction_length=horizon, freq="W")
        return out["predictions"].values[:horizon]
    raise ValueError(model_name)


def _score_against(test_values, pred):
    if test_values.min() == 0:
        return np.mean(np.abs(test_values - pred)) / (test_values.mean() + 1e-9) * 100
    return mape(test_values, pred)


def split_for(sub_df):
    weekly = sub_df.set_index("sales_date").resample("W")["net_sales"].sum().iloc[1:-1]
    full_index = pd.date_range(weekly.index.min(), weekly.index.max(), freq="W")
    weekly = weekly.reindex(full_index, fill_value=0.0)
    train, test = weekly.loc[:TRAIN_END], weekly.loc[TEST_START:TEST_END]
    if len(test) < 52 or train.sum() == 0:
        return None
    return train, test


# ---- Pass 1: local candidates (fast, sequential) ----
jobs, skipped = [], 0
for dim, col in DIMENSIONS:
    print(f"\n{'='*70}\nDIMENSION: {dim}\n{'='*70}")
    for value in sorted(df[col].unique()):
        sub = df[df[col] == value]
        s = split_for(sub)
        if s is None:
            skipped += 1
            continue
        train, test = s
        scores = {}
        for name in CANDIDATES:
            try:
                pred = run_forecast(name, train, len(test))
                scores[name] = round(float(_score_against(test.values, pred)), 1)
            except Exception as e:
                print(f"    [{name} failed for {dim}={value}: {type(e).__name__}: {e}]")
        local_champ = min(scores, key=scores.get) if scores else None
        print(f"  {value:<24} local-best={local_champ} ({scores.get(local_champ, '?')}%)")
        jobs.append({"dim": dim, "value": value, "train": train, "test": test, "scores": scores})

print(f"\n{len(jobs)} values have >=52 weeks of real test data -- {skipped} skipped as too thin at weekly grain "
      f"(compare: score_dimensional.py's monthly test kept 302 of these same {len(jobs)+skipped} candidates)")

# ---- Pass 2: LLM candidate, in parallel ----
print(f"\n{'='*70}\nRunning {LLM_CANDIDATE} (weekly) for all {len(jobs)} qualifying values IN PARALLEL...\n{'='*70}")


def score_llm(job):
    try:
        preds = llm_predict(list(job["train"].values), len(job["test"]), "weekly", metric_label=METRIC_LABEL,
                             dimension=job["dim"], dimension_value=job["value"], log_fn=lambda m: None)
        m = round(float(_score_against(job["test"].values, np.asarray(preds))), 1)
        return job["dim"], job["value"], m
    except Exception as e:
        print(f"    [{LLM_CANDIDATE} failed for {job['dim']}={job['value']}: {type(e).__name__}: {e}]")
        return job["dim"], job["value"], None


done = 0
with ThreadPoolExecutor(max_workers=8) as pool:
    futures = {pool.submit(score_llm, job): job for job in jobs}
    for future in as_completed(futures):
        job = futures[future]
        dim, value, m = future.result()
        done += 1
        if m is not None:
            job["scores"][LLM_CANDIDATE] = m
        if done % 25 == 0 or done == len(jobs):
            print(f"  ...{done}/{len(jobs)} done")

# ---- Merge + save ----
results = {}
llm_wins = []
for job in jobs:
    results.setdefault(job["dim"], {})
    champion = min(job["scores"], key=job["scores"].get)
    results[job["dim"]][job["value"]] = {"champion": champion, "scores": job["scores"]}
    if champion == LLM_CANDIDATE:
        llm_wins.append(f"{job['dim']}={job['value']} ({job['scores'][champion]}% MAPE)")

with open("champions_dimensional_weekly.json", "w") as f:
    json.dump(results, f, indent=2)
print("\nSaved -> champions_dimensional_weekly.json")

print("\n" + "=" * 70)
print("SUMMARY (champion counts + avg MAPE per dimension)")
print("=" * 70)
for dim, values in results.items():
    if not values:
        continue
    counts = {}
    for info in values.values():
        counts[info["champion"]] = counts.get(info["champion"], 0) + 1
    avg_mape = np.mean([info["scores"][info["champion"]] for info in values.values()])
    print(f"  {dim:<14} {len(values)} values -- {counts} -- avg champion MAPE = {avg_mape:.1f}%")

print(f"\n{LLM_CANDIDATE} won {len(llm_wins)} of {len(jobs)} qualifying dimension values at WEEK grain:")
for w in llm_wins:
    print(f"  {w}")
