"""Explicit predicted-vs-actual comparison for 2025 -- trains every candidate on ONLY
2021-2024, predicts all 12 months of 2025, then prints each prediction directly next to the
real recorded 2025 value. Same split score_whole_business.py already used to pick the
champion (chronos); this just makes the comparison visible month-by-month instead of
collapsed into a single MAPE number.
"""
import numpy as np
import pandas as pd
from forecasting_core import run_forecast

df = pd.read_csv("medical_sales_5yr_250k.csv", parse_dates=["sales_date"])
monthly = df.set_index("sales_date").resample("MS")["net_sales"].sum()

train = monthly.loc[:"2024-12-31"]
actual_2025 = monthly.loc["2025-01-01":"2025-12-31"]

print(f"Train: {len(train)} months, through {train.index.max().strftime('%B %Y')}")
print(f"Actual 2025 (held out during training, compared against now): {len(actual_2025)} months\n")


def mape(actual, pred):
    return np.mean(np.abs((np.asarray(actual) - np.asarray(pred)) / np.asarray(actual))) * 100


CANDIDATES = ["naive_last_value", "moving_avg", "linear_trend", "seasonal_naive", "chronos"]
results = {name: run_forecast(name, train, 12, "MS") for name in CANDIDATES}

print("=" * 92)
print(f"{'Month':<12}" + "".join(f"{c:>16}" for c in CANDIDATES) + f"{'ACTUAL':>16}")
print("=" * 92)
for i, month in enumerate(actual_2025.index):
    row = f"{month.strftime('%b %Y'):<12}"
    for name in CANDIDATES:
        row += f"{results[name][i]:>16,.0f}"
    row += f"{actual_2025.iloc[i]:>16,.0f}"
    print(row)

print("\n" + "=" * 92)
print("MAPE across all 12 months of 2025 (lower is better)")
print("=" * 92)
for name in CANDIDATES:
    print(f"  {name:<20} {mape(actual_2025.values, results[name]):>6.1f}%")

print("\n" + "=" * 92)
print(f"FULL YEAR 2025 -- actual = {actual_2025.sum():,.1f}")
print("=" * 92)
for name in CANDIDATES:
    pred_total = results[name].sum()
    diff_pct = (actual_2025.sum() - pred_total) / actual_2025.sum() * 100
    print(f"  {name:<20} predicted {pred_total:>14,.1f}  diff {diff_pct:>+6.1f}%")

winner_month = min(CANDIDATES, key=lambda c: mape(actual_2025.values, results[c]))
winner_year = min(CANDIDATES, key=lambda c: abs((actual_2025.sum() - results[c].sum()) / actual_2025.sum()))
print(f"\nBest on monthly MAPE: {winner_month}")
print(f"Best on full-year total: {winner_year}")
print("\nRecall the champion score_whole_business.py picked from this exact same split: chronos "
      "(week/month/year, both net_sales and profit).")
