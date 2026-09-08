import { motion } from 'framer-motion'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MODEL_COLORS, MODEL_DOCS } from '../../pages/modelDocs'
import { formatCompact, formatFull } from '../../utils/formatNumber'
import type { ChartPoint } from '../../types/api'

interface Row {
  date: string
  actual?: number
  forecast?: number
}

function buildRows(history: ChartPoint[], forecastPoint?: ChartPoint | null): Row[] {
  const rows: Row[] = history.map((p) => ({ date: p.date, actual: p.value }))
  if (forecastPoint) {
    const last = rows[rows.length - 1]
    if (last) last.forecast = last.actual
    rows.push({ date: forecastPoint.date, forecast: forecastPoint.value })
  }
  return rows
}

function axisLabel(dateStr: string, grain: 'week' | 'month' | 'year') {
  if (grain === 'year') return dateStr.slice(0, 4)
  const d = new Date(`${dateStr}T00:00:00`)
  if (grain === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function TrendChart({
  history,
  forecastPoint,
  modelForecasts,
  championModel,
  metricLabel,
  grain = 'year',
  loading,
}: {
  history: ChartPoint[]
  forecastPoint?: ChartPoint | null
  /** Every candidate model's own guess for forecastPoint's exact target, keyed by model --
   *  shown as small reference dots alongside the champion's own (already part of the area
   *  chart's dashed segment), so the chart reads as "here's what every approach said," not
   *  just the one number that was chosen. */
  modelForecasts?: Record<string, number>
  /** Which key in modelForecasts is the one actually shown/trusted -- highlighted among the
   *  others rather than given its own separate dot, since it's already the chart's real
   *  forecast point. */
  championModel?: string | null
  metricLabel: string
  grain?: 'week' | 'month' | 'year'
  /** True only while there is no chart data at all yet -- shows a chart-shaped placeholder
   *  instead of "no history", which otherwise reads as a permanent empty state mid-fetch. */
  loading?: boolean
}) {
  const rows = buildRows(history, forecastPoint)
  const label = (dateStr: string) => axisLabel(dateStr, grain)
  // Every OTHER candidate's guess for the same target -- the champion isn't repeated here as
  // its own dot, since it's already the chart's own forecast point/dashed segment.
  const otherModels = Object.entries(modelForecasts ?? {})
    .filter(([model]) => model !== championModel)
    .sort((a, b) => b[1] - a[1])
  // Every candidate INCLUDING the champion -- for the numbers list below the chart, so a
  // reader sees the full field of guesses (Chronos-2 included) side by side, not just "the
  // other ones."
  const allModels = Object.entries(modelForecasts ?? {}).sort((a, b) => b[1] - a[1])
  // recharts' auto y-domain only looks at the `data` array (the area/line points) -- it has no
  // idea the ReferenceDots below exist, so a model guessing well above the trend line (a
  // common case: naive/moving-average forecasts often run higher than a trend-aware model)
  // would get silently clipped off the top of the chart without this.
  const maxPlottedValue = Math.max(
    0,
    ...rows.map((r) => r.actual ?? -Infinity),
    ...rows.map((r) => r.forecast ?? -Infinity),
    ...otherModels.map(([, v]) => v),
  )
  const yDomain: [number, number] = [0, maxPlottedValue * 1.08]

  if (rows.length === 0 && loading) {
    return (
      <div className="mt-5 flex h-[26rem] items-end gap-3 px-2 pb-8">
        {[38, 55, 46, 62, 50, 70, 58].map((h, i) => (
          <div
            key={i}
            className="flex-1 animate-pulse rounded-t-lg bg-slate-200 dark:bg-slate-800"
            style={{ height: `${h}%`, animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-96 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
        No history available for this selection.
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mt-5 w-full"
    >
      {/* Fixed-height box for the chart itself only -- ResponsiveContainer needs a definite
       *  parent height to resolve height="100%" against. The legend and model-prediction cards
       *  below are siblings OUTSIDE this box, in normal flow, so they can never overlap the
       *  next section the way they would if this whole block shared one fixed height. */}
      <div className="relative h-[26rem] w-full">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-[1px] dark:bg-slate-950/60">
            <span className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-primary-700 shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-primary-300">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400" />
              Updating chart…
            </span>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 24, right: 24, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="actualFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary-500)" stopOpacity={0.5} />
              <stop offset="100%" stopColor="var(--color-primary-500)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent-500)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--color-accent-500)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="4 4" className="stroke-slate-200 dark:stroke-slate-800" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={label}
            tick={{ fontSize: 15, fontWeight: 600, fill: 'currentColor' }}
            className="text-slate-600 dark:text-slate-300"
            axisLine={false}
            tickLine={false}
            padding={{ left: 16, right: 16 }}
          />
          <YAxis
            domain={yDomain}
            tick={{ fontSize: 14, fontWeight: 500, fill: 'currentColor' }}
            className="text-slate-500 dark:text-slate-400"
            width={64}
            tickFormatter={(v: number) => formatCompact(v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value, name) => [
              typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value,
              name === 'actual' ? metricLabel : `${metricLabel} (forecast)`,
            ]}
            labelFormatter={(l) => (typeof l === 'string' ? label(l) : l)}
            contentStyle={{
              borderRadius: 16,
              border: 'none',
              boxShadow: '0 8px 28px -6px rgb(15 23 42 / 0.25)',
              fontSize: 14,
              fontWeight: 600,
              padding: '12px 16px',
            }}
          />
          <Area
            type="monotone"
            dataKey="actual"
            name="actual"
            stroke="var(--color-primary-600)"
            strokeWidth={4}
            fill="url(#actualFill)"
            dot={{ r: 5, fill: 'var(--color-primary-600)', strokeWidth: 2, stroke: 'white' }}
            activeDot={{ r: 7 }}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="forecast"
            name="forecast"
            stroke="var(--color-accent-500)"
            strokeWidth={4}
            strokeDasharray="8 7"
            fill="url(#forecastFill)"
            dot={{ r: 6, fill: 'var(--color-accent-500)', strokeWidth: 2, stroke: 'white' }}
            connectNulls
          />
          {forecastPoint &&
            otherModels.map(([model, value]) => (
              <ReferenceDot
                key={model}
                x={forecastPoint.date}
                y={value}
                r={4.5}
                fill={MODEL_COLORS[model] ?? 'var(--color-slate-400)'}
                stroke="white"
                strokeWidth={1.5}
                fillOpacity={0.85}
              />
            ))}
        </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-3 flex items-center justify-center gap-6 text-sm font-semibold text-slate-600 dark:text-slate-300">
        <span className="flex items-center gap-2">
          <span className="h-1.5 w-6 rounded-full bg-primary-600" /> Actual
        </span>
        <span className="flex items-center gap-2">
          <span
            className="h-1.5 w-6 rounded-full bg-accent-500"
            style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--color-accent-500) 0 6px, transparent 6px 10px)' }}
          />
          Forecast{championModel && ` (${MODEL_DOCS[championModel]?.label ?? championModel})`}
        </span>
      </div>
      {allModels.length > 0 && (
        <div className="mt-4">
          <p className="text-center text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Every model's prediction{forecastPoint?.date ? ` for ${forecastPoint.date.slice(0, 4)}` : ''}
          </p>
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {allModels.map(([model, value]) => {
              const isChampion = model === championModel
              return (
                <div
                  key={model}
                  className={`rounded-xl border-2 px-3 py-2 ${
                    isChampion
                      ? 'border-accent-300 bg-accent-50/70 dark:border-accent-700 dark:bg-accent-950/30'
                      : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm dark:border-slate-900"
                      style={{ background: MODEL_COLORS[model] ?? 'var(--color-slate-400)' }}
                    />
                    <span
                      className={`truncate text-xs font-bold ${
                        isChampion ? 'text-accent-700 dark:text-accent-300' : 'text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {MODEL_DOCS[model]?.label ?? model}
                    </span>
                    {isChampion && (
                      <span className="ml-auto shrink-0 rounded-full bg-accent-600 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-white">
                        Selected
                      </span>
                    )}
                  </div>
                  <p className="tabular-figure mt-1 text-[15px] font-extrabold text-slate-900 dark:text-slate-50">
                    {formatFull(value)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}
