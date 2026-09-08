import type { ReactNode } from 'react'
import { useMetadata } from '../../context/MetadataContext'
import { MODEL_DOCS } from '../../pages/modelDocs'
import type { MetricResult, ParsedParams } from '../../types/api'
import { displayName } from '../../utils/displayNames'
import { ConfidenceBadge } from '../ConfidenceBadge'
import { ForecastChart } from '../ForecastChart'

// Same visual language as DeclineExplanationCard -- a "what" answer (a value or forecast) and
// a "why" answer (explain_decline's drill-down) should look like they came from the same
// product, not two different ones bolted together. Every number here is still exactly what
// answer_question() returned; only the presentation changed.

function fmt(n?: number | null) {
  if (n == null) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

// The chart_data series always ends at the last RECORDED period -- for a genuine forecast
// (is_actual: false) the period the question actually asked about sits some number of periods
// beyond that. periods_ahead/period_unit are that exact offset (the same one answer_question()
// computed server-side), so this reconstructs the forecast's date without the backend having to
// carry a redundant field for it.
function addPeriods(dateStr: string, count: number, unit: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (unit === 'week') d.setUTCDate(d.getUTCDate() + count * 7)
  else if (unit === 'year') d.setUTCFullYear(d.getUTCFullYear() + count)
  else d.setUTCMonth(d.getUTCMonth() + count)
  return d.toISOString().slice(0, 10)
}

// Keyed by the single most decision-relevant fact about a value/forecast answer: is this a
// real recorded actual (informational blue), or a forecast -- in which case confidence is the
// thing to lead with, exactly like DeclineExplanationCard leads with direction.
const STATUS_BG: Record<string, string> = {
  actual: 'from-blue-500 to-indigo-600',
  high: 'from-primary-500 to-accent-600',
  moderate: 'from-amber-500 to-orange-600',
  low: 'from-red-500 to-rose-600',
}

function Fact({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-0.5 text-[15px] font-semibold text-slate-800 dark:text-slate-200 ${mono ? 'tabular-figure' : ''}`}>
        {value}
      </p>
    </div>
  )
}

// Mirrors app.py lines 219-324 -- three distinct, dynamically-derived refusal reasons (never
// one fixed message), then the full "ok" display: confidence badge, actual-vs-forecast
// banner, 80% range, answer text, "how computed" facts grid, chart.
export function MetricResultCard({ result, parsed }: { result: MetricResult; parsed: ParsedParams }) {
  const { data } = useMetadata()
  if (!data) return null

  const label = data.metric_labels[result.metric] ?? result.metric
  const { dimension, dimension_value: dimensionValue } = parsed

  if (result.status === 'failed') {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
        ⚠️ <strong>{label}</strong> — couldn't be computed right now: {result.error_message}. The
        other metrics in this question, if any, were not affected.
      </div>
    )
  }

  if (result.status === 'refused') {
    const validatedDims = Object.keys(data.dimensional_champions).sort()
    const validatedMetrics = Object.keys(data.champions).sort()
    const dimensionValueDisplay = displayName(dimension, dimensionValue)

    let message: string
    if (result.refusal_reason === 'unvalidated_dimension') {
      const detail =
        dimension && !data.dimensions_with_backtest.includes(dimension)
          ? `Backtested dimensions so far are ${validatedDims.join('/') || 'none'} — ${dimension}-level forecasting hasn't been built or backtested yet.`
          : `Only net sales has been backtested at ${dimension} level — ${label} for this ${dimension} hasn't been validated.`
      message = `${label} for ${dimension} = ${dimensionValueDisplay} — ${detail} Skipping this rather than assuming the same model works for it.`
    } else if (result.refusal_reason === 'dimension_forecast_out_of_range') {
      message = `${label} for ${dimension} = ${dimensionValueDisplay}, ${result.period_label} — dimension-level forecasts only cover next month, the exact horizon that was backtested; further out hasn't been validated at this level yet (whole-business forecasts don't have this limit).`
    } else if (result.refusal_reason === 'champion_too_unreliable') {
      message = `${label} for ${dimension} = ${dimensionValueDisplay} — this was backtested, but even the best-performing model was measured to be too inaccurate to trust (its own error rate was too high). Showing that number would be worse than not answering, so it's skipping this rather than presenting an unreliable forecast as if it were a solid one.`
    } else {
      const labels = validatedMetrics.map((m) => data.metric_labels[m] ?? m)
      message = `${label} — this metric has never been backtested (validated: ${labels.join(', ') || 'none'}); forecasting ${label} hasn't been proven reliable, so it's skipping that rather than assuming the same model works for it.`
    }

    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-base text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        ⚠️ {message}
      </div>
    )
  }

  // status === "ok"
  const periodsAhead = result.periods_ahead ?? 1
  const periodUnit = result.period_unit ?? 'month'
  const scope = dimensionValue ? `${dimension} = ${displayName(dimension, dimensionValue)}` : 'Whole business'
  const statusKey = result.is_actual ? 'actual' : (result.confidence_level ?? 'high')

  const lastHistoryPoint = result.chart_data[result.chart_data.length - 1]
  const forecastPoint =
    !result.is_actual && lastHistoryPoint && result.predicted_value != null
      ? { date: addPeriods(lastHistoryPoint.date, periodsAhead, periodUnit), value: result.predicted_value }
      : null

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)] dark:border-slate-800 dark:bg-slate-900">
      {/* Bold gradient header band -- same treatment as DeclineExplanationCard */}
      <div className={`bg-gradient-to-br ${STATUS_BG[statusKey] ?? STATUS_BG.high} px-6 py-5 text-white`}>
        <p className="text-xs font-bold uppercase tracking-widest text-white/80">{scope}</p>
        <h3 className="mt-1 text-2xl font-bold capitalize">{label}</h3>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">{result.period_label}</p>
            <span className="mt-1 inline-block rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide">
              {result.is_actual ? '📌 Recorded actual' : '🔮 Forecast'}
            </span>
          </div>
          <div className="text-right">
            {!result.is_actual && result.model_name && (
              <p
                className="text-xs font-bold uppercase tracking-wide text-white/75"
                title={
                  result.error_pct != null
                    ? `This model's own error rate when it was tested predicting the last real year of data (2025) -- not a measurement of the number below, which is a genuine future guess with no real answer to check it against yet.`
                    : undefined
                }
              >
                {MODEL_DOCS[result.model_name]?.label ?? result.model_name}
                {result.error_pct != null && ` · ±${result.error_pct.toFixed(1)}% backtested MAPE`}
              </p>
            )}
            <p className="tabular-figure text-4xl font-extrabold leading-none">{fmt(result.predicted_value)}</p>
          </div>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {result.is_actual ? (
          <div className="rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-3 text-base font-medium text-blue-900 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-200">
            📌 {result.period_label} is already fully in the data — the figure above is the
            recorded actual, not a forecast.
          </div>
        ) : (
          periodsAhead > 1 && (
            <ConfidenceBadge level={result.confidence_level ?? 'high'} reason={result.confidence_reason ?? ''} />
          )
        )}

        <div className="border-l-4 border-primary-400 pl-4 dark:border-primary-600">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-600 dark:text-primary-400">
            What this means
          </p>
          <p className="mt-2 text-lg leading-relaxed text-slate-800 dark:text-slate-200">{result.answer_text}</p>
        </div>

        {result.range_low != null && result.range_high != null && (
          <div className="rounded-2xl border-2 border-accent-200 bg-gradient-to-br from-accent-50 to-white p-4 dark:border-accent-800 dark:from-accent-950/40 dark:to-slate-900">
            <p className="text-xs font-bold uppercase tracking-widest text-accent-700 dark:text-accent-300">
              80% confidence range
            </p>
            <p className="tabular-figure mt-1.5 text-xl font-bold text-slate-900 dark:text-slate-50">
              {fmt(result.range_low)} – {fmt(result.range_high)}
            </p>
          </div>
        )}

        <details className="group rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
          <summary className="cursor-pointer text-sm font-bold uppercase tracking-widest text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400">
            How the {label} figure was computed
          </summary>

          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
            <Fact label="Metric" value={`${label} (${result.metric})`} />
            <Fact label="Scope" value={scope} />
            <Fact
              label="Horizon asked"
              value={
                parsed.horizon +
                (parsed.explicit_year ? ` · year ${parsed.explicit_year}` : '') +
                (parsed.explicit_month ? ` · month ${parsed.explicit_month}` : '')
              }
            />
            <Fact
              label="Period this answers"
              value={`${result.period_label} — ${result.is_actual ? 'actual, recorded' : 'forecast'}`}
            />
            <Fact
              label="Model used"
              value={
                result.model_name
                  ? `${MODEL_DOCS[result.model_name]?.label ?? result.model_name}` +
                    (result.error_pct != null ? ` (±${result.error_pct.toFixed(1)}% backtested MAPE)` : '')
                  : 'none — direct lookup'
              }
              mono
            />
            <Fact
              label="Confidence"
              value={`${result.confidence_level ?? '—'} — ${result.confidence_reason ?? 'n/a'}`}
            />
            <Fact
              label={`${periodUnit.charAt(0).toUpperCase() + periodUnit.slice(1)}s beyond backtested horizon`}
              value={Math.max(periodsAhead - 1, 0)}
              mono
            />
            <Fact
              label="80% range"
              value={
                result.range_low != null
                  ? `${fmt(result.range_low)} – ${fmt(result.range_high)}`
                  : 'not available for this method'
              }
              mono
            />
          </div>

          <div className="mt-4 rounded-xl border-l-4 border-primary-300 bg-white px-4 py-3 dark:border-primary-700 dark:bg-slate-900">
            <p className="text-[11px] font-bold uppercase tracking-wide text-primary-600 dark:text-primary-400">Why this model</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{result.reason}</p>
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-primary-600 dark:text-slate-500 dark:hover:text-primary-400">
              Raw champion tables (technical)
            </summary>
            <div className="mt-2 space-y-2 rounded-lg bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-500 dark:bg-slate-900 dark:text-slate-400">
              <p className="break-all">whole business: {JSON.stringify(data.champions)}</p>
              {dimensionValue && (
                <p className="break-all">
                  {dimension}: {JSON.stringify(data.dimensional_champions[dimension!] ?? {})}
                </p>
              )}
            </div>
          </details>
        </details>

        <div className="rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5 dark:border-primary-800 dark:from-primary-950/40 dark:to-slate-900">
          <p className="text-xs font-bold uppercase tracking-widest text-primary-700 dark:text-primary-300">
            {forecastPoint ? 'History & forecast' : 'Recent history'}
          </p>
          <ForecastChart data={result.chart_data} label={label} forecastPoint={forecastPoint} />
        </div>
      </div>
    </div>
  )
}
