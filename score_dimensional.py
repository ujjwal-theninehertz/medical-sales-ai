"""Per-dimension-value backtests for net_sales, monthly grain, on the new medical dataset.
Same train(2021-2024)/test(2025) split and same 5 local candidates as score_whole_business.py,
plus claude-haiku-4-5 as a 6th, just filtered to one dimension value at a time first.

Scope decided by eda_medical.py's density check, not assumed: stock_branch/route/category/
product_type/customer_type/supplier all cleared >75 rows/month/value (the old BizWiz
branch/route data, at ~19 rows/month/value, was the previous bar for "barely viable"). product
is included despite sitting right at that old bar (~21 avg, min 3) -- density alone doesn't
prove accuracy, so it's tested and reported honestly like everything else, not excluded by
assumption. customer_id (~8 avg, min 1) is excluded outright -- individual customers are too
thin to forecast at any grain this data supports.

The LLM candidate's 302 calls are network-bound and run in PARALLEL (ThreadPoolExecutor) --
the 5 local candidates are computed sequentially first (fast, no benefit to parallelizing),
then every dimension value's Haiku call fires concurrently. Where Haiku wins a dimension
value, the live answer path really does call it for that value's next-month forecast; the
Model Playground stays free/local-only and never includes it.
"""
import json
import numpy as np
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from llm_client import llm_predict

df = pd.read_csv("medical_sales_5yr_250k.csv", parse_dates=["sales_date"])
CANDIDATES = ["naive_last_value", "moving_avg", "linear_trend", "seasonal_naive", "chronos"]
LLM_CANDIDATE = "claude-haiku-4-5"
TRAIN_END, TEST_START, TEST_END = "2024-12-31", "2025-01-01", "2025-12-31"

DIMENSIONS = [
    ("branch", "stock_branch"), ("route", "route"), ("category", "category"),
    ("product_type", "product_type"), ("customer_type", "customer_type"),
    ("supplier", "supplier"), ("product", "product"),
]


def mape(actual, pred):
    actual, pred = np.asarray(actual), np.asarray(pred)
    return np.mean(np.abs((actual - pred) / actual)) * 100


def run_forecast(model_name, train_series, horizon, freq="MS"):
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


def _score_against(test_values, pred):
    if test_values.min() == 0:
        return np.mean(np.abs(test_values - pred)) / (test_values.mean() + 1e-9) * 100
    return mape(test_values, pred)


def score_one_local(sub_df, label):
    """5 local candidates only -- fast, sequential. Returns None if too little data,
    otherwise the train/test split (needed for the LLM pass) plus local scores."""
    monthly = sub_df.set_index("sales_date").resample("MS")["net_sales"].sum()
    full_index = pd.date_range(monthly.index.min(), monthly.index.max(), freq="MS")
    monthly = monthly.reindex(full_index, fill_value=0.0)
    train, test = monthly.loc[:TRAIN_END], monthly.loc[TEST_START:TEST_END]
    if len(test) < 12 or train.sum() == 0:
        print(f"  {label:<24} SKIPPED -- insufficient data (train={len(train)}, test={len(test)})")
        return None

    scores = {}
    for name in CANDIDATES:
        try:
            pred = run_forecast(name, train, len(test))
            scores[name] = round(float(_score_against(test.values, pred)), 1)
        except Exception as e:
            print(f"    [{name} failed for {label}: {type(e).__name__}: {e}]")
    return {"train": train, "test": test, "scores": scores}


def _score_llm_job(item):
    dim, value, train, test = item["dim"], item["value"], item["train"], item["test"]
    try:
        # period_label is the frequency word ONLY -- metric and scope are separate arguments.
        # This used to pass "monthly net sales" as the period_label, which llm_predict then
        # re-appended its own hardcoded "net sales" to ("...monthly net sales net sales...").
        # Scope is passed too so this backtest prompt is byte-identical to what runs live
        # for whichever dimension values Haiku ends up winning.
        preds = llm_predict(list(train.values), len(test), "monthly", metric_label="net sales",
                             dimension=dim, dimension_value=value, log_fn=lambda m: None)
        m = round(float(_score_against(test.values, np.asarray(preds))), 1)
        return dim, value, m
    except Exception as e:
        print(f"    [{LLM_CANDIDATE} failed for {dim}={value}: {type(e).__name__}: {e}]")
        return dim, value, None


# ---- Pass 1: local candidates for every dimension value (fast, sequential) ----
results = {}
items = []
for dim, col in DIMENSIONS:
    print(f"\n{'='*70}\nDIMENSION: {dim}\n{'='*70}")
    results[dim] = {}
    for value in sorted(df[col].unique()):
        sub = df[df[col] == value]
        r = score_one_local(sub, value)
        if r:
            local_champion = min(r["scores"], key=r["scores"].get) if r["scores"] else None
            print(f"  {value:<24} local-champion={local_champion:<18} scores={r['scores']}")
            items.append({"dim": dim, "value": value, **r})

# ---- Pass 2: LLM candidate, in parallel ----
print(f"\n{'='*70}\nRunning {LLM_CANDIDATE} for all {len(items)} dimension values IN PARALLEL...\n{'='*70}")
llm_wins = []
with ThreadPoolExecutor(max_workers=8) as pool:
    futures = {pool.submit(_score_llm_job, item): item for item in items}
    done = 0
    for future in as_completed(futures):
        item = futures[future]
        dim, value, llm_mape = future.result()
        done += 1
        if llm_mape is not None:
            item["scores"][LLM_CANDIDATE] = llm_mape
        if done % 25 == 0 or done == len(items):
            print(f"  ...{done}/{len(items)} done")

# ---- Merge + save ----
for item in items:
    champion = min(item["scores"], key=item["scores"].get)
    results[item["dim"]][item["value"]] = {"champion": champion, "scores": item["scores"]}
    if champion == LLM_CANDIDATE:
        llm_wins.append(f"{item['dim']}={item['value']}")

with open("champions_dimensional.json", "w") as f:
    json.dump(results, f, indent=2)
print("\nSaved -> champions_dimensional.json")

print("\n" + "=" * 70)
print("SUMMARY (avg MAPE per dimension, across its values' champions)")
print("=" * 70)
for dim, values in results.items():
    if not values:
        continue
    avg_mape = np.mean([info["scores"][info["champion"]] for info in values.values()])
    print(f"  {dim:<14} {len(values)} values scored, avg champion MAPE = {avg_mape:.1f}%")

print(f"\n{LLM_CANDIDATE} won {len(llm_wins)} of {len(items)} dimension values:")
for w in llm_wins:
    print(f"  {w}")
