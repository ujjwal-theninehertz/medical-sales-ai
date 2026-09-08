"""Full backtest on the new medical dataset -- train 2021-2024, test 2025 (the only full
held-out year available; this data has no 2026 the way the old BizWiz set did) -- at weekly
AND monthly grain, for every metric actually being validated for forecasting (net_sales,
profit). Nothing here decides which metrics get answered live -- forecasting_core.py refuses
any metric with no entry here.

Replaces score_6yr.py (deleted, along with the rest of the old BizWiz-era data -- same
backtest methodology, new data source and date split).

Adds claude-haiku-4-5 (llm_predict, via llm_client.py) as a 6th candidate, run in PARALLEL
via ThreadPoolExecutor -- these are the only network-bound calls here (everything else is
local/instant), so only they benefit from concurrency. It only earns a place in CHAMPIONS if
it wins here, the same rule every other candidate already had to clear -- and where it does
win, the live answer path really does call it, so a live answer can cost an API call. The
Model Playground stays free/local-only by design and never includes it.
"""
import json
import numpy as np
import pandas as pd
from concurrent.futures import ThreadPoolExecutor, as_completed
from llm_client import llm_predict
# METRIC_LABELS is the one place metric display names live (forecasting_core reads them
# alongside the metric columns) -- imported rather than retyped so the label Haiku is given
# during this backtest is literally the same string the live answer path gives it.
from forecasting_core import METRIC_LABELS

df = pd.read_csv("medical_sales_5yr_250k.csv", parse_dates=["sales_date"])
LLM_CANDIDATE = "claude-haiku-4-5"


def mape(actual, pred):
    actual, pred = np.asarray(actual), np.asarray(pred)
    return np.mean(np.abs((actual - pred) / actual)) * 100


def mae(actual, pred):
    return float(np.mean(np.abs(np.asarray(actual) - np.asarray(pred))))


def run_forecast(model_name, train_series, horizon, freq):
    cycle = 52 if freq == "W" else 12
    if model_name == "naive_last_value":
        return np.full(horizon, train_series.iloc[-1])
    if model_name == "moving_avg":
        window = 8 if freq == "W" else 3
        return np.full(horizon, train_series.iloc[-window:].mean())
    if model_name == "linear_trend":
        x = np.arange(len(train_series))
        slope, intercept = np.polyfit(x, train_series.values, 1)
        fx = np.arange(len(train_series), len(train_series) + horizon)
        return slope * fx + intercept
    if model_name == "seasonal_naive":
        end = -cycle + horizon
        return train_series.iloc[-cycle:end if end < 0 else None].values[:horizon]
    if model_name == "chronos":
        from chronos import Chronos2Pipeline
        input_df = pd.DataFrame({"item_id": "business", "timestamp": train_series.index,
                                  "target": train_series.values})
        pipe = Chronos2Pipeline.from_pretrained("amazon/chronos-2")
        out = pipe.predict_df(input_df, prediction_length=horizon, freq=freq)
        return out["predictions"].values[:horizon]
    raise ValueError(model_name)


def run_llm_forecast(train_series, horizon, period_label, metric_label):
    """period_label is the frequency word ONLY ("weekly"/"monthly"); metric_label names what
    the numbers measure. These used to be jammed into one string ("weekly net sales") that
    llm_predict then appended its own hardcoded "net sales" to -- so the profit backtest was
    scoring Haiku on a prompt that told it the numbers were net sales. Both are now passed
    separately, exactly as the live path passes them, so what wins here is what runs live."""
    preds = llm_predict(list(train_series.values), horizon, period_label,
                         metric_label=metric_label, log_fn=lambda m: None)
    return np.asarray(preds)


CANDIDATES = ["naive_last_value", "moving_avg", "linear_trend", "seasonal_naive", "chronos"]
METRICS = ["net_sales", "profit"]  # only metrics actually backtested -> only ones forecastable live
TRAIN_END = "2024-12-31"
TEST_START, TEST_END = "2025-01-01", "2025-12-31"

all_champions = {}
all_results = {}
llm_jobs = []  # (metric, "week"/"month", train_series, test_series, period_label) -- run after the loop, in parallel

for metric in METRICS:
    print("\n" + "#" * 78)
    print(f"# METRIC: {metric}")
    print("#" * 78)
    results = {}

    weekly = df.set_index("sales_date").resample("W")[metric].sum().iloc[1:-1]
    w_train, w_test = weekly.loc[:TRAIN_END], weekly.loc[TEST_START:TEST_END]
    print(f"Weekly: train={len(w_train)} wks, test={len(w_test)} wks")
    results["week"] = {}
    for name in CANDIDATES:
        try:
            pred = run_forecast(name, w_train, len(w_test), "W")
            results["week"][name] = {"mape": round(mape(w_test.values, pred), 1),
                                      "mae": round(mae(w_test.values, pred), 1)}
        except Exception as e:
            print(f"  [{name} failed on weekly: {type(e).__name__}: {e}]")
    llm_jobs.append((metric, "week", w_train, w_test, "weekly", METRIC_LABELS.get(metric, metric)))

    monthly = df.set_index("sales_date").resample("MS")[metric].sum()
    m_train, m_test = monthly.loc[:TRAIN_END], monthly.loc[TEST_START:TEST_END]
    print(f"Monthly: train={len(m_train)} mo, test={len(m_test)} mo")
    results["month"] = {}
    month_preds = {}
    for name in CANDIDATES:
        try:
            pred = run_forecast(name, m_train, len(m_test), "MS")
            month_preds[name] = pred
            results["month"][name] = {"mape": round(mape(m_test.values, pred), 1),
                                       "mae": round(mae(m_test.values, pred), 1)}
        except Exception as e:
            print(f"  [{name} failed on monthly: {type(e).__name__}: {e}]")
    llm_jobs.append((metric, "month", m_train, m_test, "monthly", METRIC_LABELS.get(metric, metric)))

    results["_month_preds"] = month_preds  # stashed for the year rollup below, after LLM results merge in
    all_results[metric] = results

# ---- LLM candidate, run in parallel (network-bound; only these 4 calls benefit from concurrency) ----
print(f"\n{'='*78}\nRunning {LLM_CANDIDATE} for all {len(llm_jobs)} (metric, grain) combos IN PARALLEL...\n{'='*78}")


def _score_llm_job(job):
    metric, grain, train, test, period_label, metric_label = job
    try:
        pred = run_llm_forecast(train, len(test), period_label, metric_label)
        m = mape(test.values, pred)
        return metric, grain, round(m, 1), round(mae(test.values, pred), 1), pred
    except Exception as e:
        print(f"  [{LLM_CANDIDATE} failed for {metric}/{grain}: {type(e).__name__}: {e}]")
        return metric, grain, None, None, None


with ThreadPoolExecutor(max_workers=4) as pool:
    for metric, grain, llm_mape, llm_mae, llm_pred in pool.map(_score_llm_job, llm_jobs):
        print(f"  {metric}/{grain:<6} {LLM_CANDIDATE:<18} MAPE {llm_mape}%  MAE {llm_mae}")
        if llm_mape is not None:
            all_results[metric][grain][LLM_CANDIDATE] = {"mape": llm_mape, "mae": llm_mae}
            if grain == "month":
                all_results[metric]["_month_preds"][LLM_CANDIDATE] = llm_pred

# ---- Now that every candidate (including the LLM) has a monthly prediction, roll up the year total ----
for metric in METRICS:
    results = all_results[metric]
    month_preds = results.pop("_month_preds")
    monthly = df.set_index("sales_date").resample("MS")[metric].sum()
    m_test = monthly.loc[TEST_START:TEST_END]
    actual_year = m_test.values.sum()
    results["year"] = {}
    for name, pred in month_preds.items():
        pred_year = np.sum(pred)
        diff_pct = (actual_year - pred_year) / actual_year * 100
        results["year"][name] = {"diff_pct": round(diff_pct, 1), "predicted": round(float(pred_year), 1)}
    results["year"]["actual"] = round(float(actual_year), 1)

    print(f"\n=== {metric} WEEKLY ===")
    for name, s in results["week"].items():
        print(f"  {name:<20} MAPE {s['mape']:>6.1f}%  MAE {s['mae']:>8.1f}")
    print(f"\n=== {metric} MONTHLY ===")
    for name, s in results["month"].items():
        print(f"  {name:<20} MAPE {s['mape']:>6.1f}%  MAE {s['mae']:>8.1f}")
    print(f"\n=== {metric} YEARLY (actual={actual_year:.1f}) ===")
    for name, s in results["year"].items():
        if name == "actual":
            continue
        print(f"  {name:<20} predicted {s['predicted']:>10.1f}  diff {s['diff_pct']:>+6.1f}%")

    champions = {}
    for horizon in ("week", "month"):
        champions[horizon] = min(results[horizon].items(), key=lambda kv: kv[1]["mape"])[0]
    year_scores = {k: v for k, v in results["year"].items() if k != "actual"}
    champions["year"] = min(year_scores.items(), key=lambda kv: abs(kv[1]["diff_pct"]))[0]
    print(f"\n{metric} CHAMPIONS: {json.dumps(champions)}")
    if LLM_CANDIDATE in champions.values():
        print(f"  *** {LLM_CANDIDATE} WON a horizon for {metric} ***")

    all_champions[metric] = champions

with open("champions_medical.json", "w") as f:
    json.dump({"champions": all_champions, "results": all_results}, f, indent=2)
print("\nSaved -> champions_medical.json")
