// Mirrors backend/app/models/*.py exactly -- keep these in sync by hand; a drift here is a
// silent contract break the backend's OpenAPI schema won't catch for you automatically.

export interface ChampionInfo {
  model: string
  reason: string
  error_pct?: number | null
}

export interface DatasetColumn {
  name: string
  label: string
  description: string
  group: string
}

export interface DatasetOverview {
  total_rows: number
  total_columns: number
  date_start: string
  date_end: string
  years_covered: number
  columns: DatasetColumn[]
  counts: Record<string, number>
  categorical_fields: Record<string, string[]>
  total_net_sales: number
}

export interface MetadataResponse {
  dimension_values: Record<string, string[]>
  metric_labels: Record<string, string>
  playground_metric_labels: Record<string, string>
  playground_dimensions: string[]
  reasons: Record<string, string>
  all_models: string[]
  dimensions_with_backtest: string[]
  champions: Record<string, Record<string, ChampionInfo>>
  dimensional_champions: Record<string, Record<string, ChampionInfo>>
  dimensional_champions_week: Record<string, Record<string, ChampionInfo>>
  dimensional_champions_year: Record<string, Record<string, ChampionInfo>>
  sample_questions: string[]
  dataset_overview: DatasetOverview
}

// ---- /api/ask ----

export interface AskRequest {
  question: string
}

export interface ParsedParams {
  horizon: 'week' | 'month' | 'year'
  explicit_year: number | null
  explicit_month: number | null
  dimension: string | null
  dimension_value: string | null
  metrics: string[]
}

export interface ChartPoint {
  date: string // ISO date
  value: number
}

export interface LlmCallLog {
  inputs: string[]
  output: string
}

export type RefusalReason =
  | 'unvalidated_dimension'
  | 'dimension_forecast_out_of_range'
  | 'unvalidated_metric'
  | 'champion_too_unreliable'

export interface MetricResult {
  metric: string
  status: 'ok' | 'refused' | 'failed'

  refusal_reason?: RefusalReason | null
  period_label?: string | null

  error_message?: string | null

  predicted_value?: number | null
  model_name?: string | null
  // The champion model's own backtested error for this exact scope/horizon -- null only when
  // is_actual (a real recorded value, not modeled).
  error_pct?: number | null
  reason?: string | null
  is_actual?: boolean | null
  periods_ahead?: number | null
  period_unit?: 'week' | 'month' | 'year' | null
  confidence_level?: 'high' | 'moderate' | 'low' | null
  confidence_reason?: string | null
  range_low?: number | null
  range_high?: number | null
  answer_text?: string | null
  chart_data: ChartPoint[]
}

// ---- decline explanation ("why did X change") ----

export interface DeclineBreakdownRow {
  value: string
  target: number
  comparison: number
  delta: number
  delta_pct?: number | null
}

export interface DeclineTotal {
  target: number
  comparison: number
  delta: number
  delta_pct?: number | null
}

export interface DeclineLevel {
  dimension: string
  value: string
  target: number
  comparison: number
  delta: number
  delta_pct?: number | null
  share_of_parent_decline_pct: number
  concentrated: boolean
  offset_note?: string | null
  all_values: DeclineBreakdownRow[]
}

export interface DeclineDriverFactor {
  target: number
  comparison: number
  delta_pct?: number | null
}

export interface DeclineDriver {
  quantity: DeclineDriverFactor
  avg_price: DeclineDriverFactor
  distinct_customers: DeclineDriverFactor
  primary_driver?: 'quantity' | 'avg_price' | 'distinct_customers' | null
}

// One fanned-out branch of the top-N drill tree -- unlike DeclineLevel (the single deepest
// path, narrated into answer_text/recommendation), a DeclineTreeNode is one of up to
// DECLINE_TOP_N siblings kept at EVERY fork, nested arbitrarily deep (children), so the UI can
// show top-3 branches x top-3 categories x top-3 products all at once.
export interface DeclineTreeNode {
  dimension: string
  value: string
  target: number
  comparison: number
  delta: number
  delta_pct?: number | null
  share_of_parent_decline_pct: number
  concentrated: boolean
  offset_note?: string | null
  all_values: DeclineBreakdownRow[]
  stopped_reason?: string | null
  driver?: DeclineDriver | null
  children: DeclineTreeNode[]
}

export interface DeclineExplanation {
  metric: string
  metric_label: string
  target_year: number
  comparison_year: number
  scope_dimension?: string | null
  scope_value?: string | null
  total: DeclineTotal
  direction: 'decrease' | 'increase' | 'flat'
  levels: DeclineLevel[]
  stopped_reason?: string | null
  horizon_note?: string | null
  driver?: DeclineDriver | null
  tree: DeclineTreeNode[]
  answer_text: string
  recommendation?: string | null
}

export interface AskResponse {
  status: 'answered' | 'dimension_refused' | 'decline_explained' | 'decline_failed'
  parsed: ParsedParams
  parse_note?: string | null
  log: string[]

  refused_dimension?: string | null
  decline_error?: string | null

  metric_results?: MetricResult[] | null
  decline?: DeclineExplanation | null
  llm_calls?: LlmCallLog[] | null
}

// ---- /api/playground/run ----

export interface PlaygroundRequest {
  metric: string
  dimension?: string | null
  dimension_value?: string | null
  year?: string | null
  month?: string | null
  freq: 'week' | 'month'
  periods_ahead: number
}

export interface ModelPrediction {
  value: number
  live_mape?: number | null
  historical_mape?: number | null
}

export interface PlaygroundResponse {
  validation_errors?: string[] | null

  error?: string | null
  valid_values?: string[] | null

  metric?: string | null
  dimension?: string | null
  dimension_value?: string | null
  target_period?: string | null // ISO date
  periods_ahead?: number | null
  freq?: 'W' | 'MS' | null
  is_backtest?: boolean | null
  actual_value?: number | null
  year_only?: boolean | null
  history_end?: string | null // ISO date
  predictions?: Record<string, ModelPrediction> | null
  failures?: Record<string, string> | null
  history_chart: ChartPoint[]
  claude_historical_mape?: number | null
  // Real step-by-step trace of the run: target resolution, train/test split, each model's
  // input window + raw output + score, final ranking. Mirrors AskResponse.log.
  log: string[]
}

// ---- /api/backtests ----

export type Grain = 'week' | 'month' | 'year'
export type Statistic = 'mape' | 'diff_pct'

export interface ModelScore {
  model: string
  reason: string
  mape?: number | null
  mae?: number | null
  diff_pct?: number | null
  predicted?: number | null
  is_champion: boolean
  error_pct?: number | null
}

export interface WholeBusinessBacktest {
  metric: string
  metric_label: string
  grain: Grain
  statistic: Statistic
  champion: string
  actual?: number | null
  scores: ModelScore[]
}

export interface DimensionBacktest {
  dimension: string
  grain: Grain
  statistic: Statistic
  values_tested: number
  champion_avg: number
  per_model_avg: Record<string, number>
  champion_wins: Record<string, number>
}

export interface ActualVsPredicted {
  scope: string
  dimension?: string | null
  dimension_value?: string | null
  target_year: number
  actual: number
  predicted: number
  champion: string
  error_pct: number
}

export interface BacktestsResponse {
  train_period: string
  test_period: string
  candidates: string[]
  reasons: Record<string, string>
  reliability_floor_pct: number
  whole_business: WholeBusinessBacktest[]
  dimensional: DimensionBacktest[]
  actual_vs_predicted: ActualVsPredicted[]
  coverage: Record<string, number>
}

// ---- /api/dashboard/summary ----

export interface KpiValue {
  value?: number | null
  unavailable_reason?: string | null
}

export interface DashboardSummary {
  year: number
  comparison_year: number
  metric: string
  metric_label: string
  dimension?: string | null
  dimension_value?: string | null
  grain: 'week' | 'month' | 'year'
  // The KPI row's own current/comparison period -- distinct from forecast_period_label below.
  // Only set for grain !== 'year' -- e.g. "week of Aug 24, 2026".
  current_period_label?: string | null
  comparison_period_label?: string | null

  total_sales: KpiValue
  total_sales_growth_pct?: number | null
  total_profit: KpiValue
  total_profit_growth_pct?: number | null

  forecast: KpiValue
  forecast_model?: string | null
  forecast_reason?: string | null
  forecast_period_label?: string | null
  forecast_is_actual: boolean

  growth_pct?: number | null
  growth_direction?: 'increase' | 'decrease' | 'flat' | null

  confidence_level?: 'high' | 'moderate' | 'low' | null
  confidence_reason?: string | null

  history_chart: ChartPoint[]
  forecast_point?: ChartPoint | null
  // Every free candidate's own guess for forecast_point's exact target, keyed by model --
  // empty whenever there's nothing to compare (an actual/recorded value, no forecast at all).
  all_model_forecasts: Record<string, number>
}

export interface DashboardFilters {
  metric: string
  dimension: string | null
  dimension_value: string | null
  grain: 'week' | 'month' | 'year'
  year: number | null
}

// ---- /api/dashboard/scopes ----

export interface ScopeRow {
  value: string
  target: number
  comparison: number
  delta: number
  delta_pct?: number | null
  direction: 'increase' | 'decrease' | 'flat'
  champion_model?: string | null
  champion_error_pct?: number | null
  forecastable: boolean
}

export interface ScopeMatrix {
  metric: string
  metric_label: string
  grain: 'week' | 'month' | 'year'
  dimension: string
  period_label?: string | null
  comparison_label?: string | null
  rows: ScopeRow[]
}
