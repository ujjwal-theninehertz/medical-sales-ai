"""Density check on the new medical dataset -- same methodology as the original BizWiz
density analysis that decided monthly grain + branch/route-only scope for Phase 1. Redone
here from scratch rather than assumed, since this data has meaningfully different shape
(250K rows vs 6,885; 15 branches/30 routes vs 5/5; two brand-new dimensions -- product_type,
customer_type). Density (rows per dimension-value per month) is what actually determines
whether a grain/dimension is forecastable at all, not row count alone.
"""
import pandas as pd

df = pd.read_csv("medical_sales_5yr_250k.csv", parse_dates=["sales_date"])
n_months = (df["sales_date"].dt.to_period("M")).nunique()
print(f"Total rows: {len(df):,}  |  Months spanned: {n_months}  |  "
      f"Date range: {df['sales_date'].min().date()} -> {df['sales_date'].max().date()}\n")

DIMENSIONS = ["stock_branch", "route", "category", "product_type", "customer_type",
              "product", "supplier", "customer_id"]

print(f"{'Dimension':<15} {'#values':>8} {'avg rows/month/value':>22} {'min rows/month/value':>22}")
print("-" * 70)
for col in DIMENSIONS:
    n_values = df[col].nunique()
    per_value_per_month = df.groupby([col, df["sales_date"].dt.to_period("M")]).size()
    # A dimension value can be legitimately absent in some months -- average/min over
    # months it DOES appear in, same as asking "how thick is a typical slice," not
    # punishing sparsity that reindex-with-zero-fill already handles downstream.
    avg = per_value_per_month.mean()
    min_ = per_value_per_month.min()
    print(f"{col:<15} {n_values:>8} {avg:>22.1f} {min_:>22}")

print("\nFor reference, the old BizWiz data (5yr for comparison): branch/route had ~19.3 "
      "rows/month/value at monthly grain and were judged forecastable (though with worse "
      "accuracy than whole-business) -- that's the bar every row above is measured against.")
