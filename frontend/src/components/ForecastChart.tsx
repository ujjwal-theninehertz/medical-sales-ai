import { CartesianGrid, Line, LineChart, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ChartPoint } from '../types/api'

interface Row {
  date: string
  actual?: number
  forecast?: number
}

export interface ComparisonPoint {
  key: string
  label: string
  value: number
  color: string
  isChampion?: boolean
}

function buildRows(
  history: ChartPoint[],
  forecastPoint?: ChartPoint | null,
  comparisonDate?: string | null,
  comparisonActual?: number | null,
): Row[] {
  const rows: Row[] = history.map((p) => ({ date: p.date, actual: p.value }))
  if (forecastPoint) {
    const last = rows[rows.length - 1]
    if (last) last.forecast = last.actual
    rows.push({ date: forecastPoint.date, forecast: forecastPoint.value })
  } else if (comparisonDate && rows[rows.length - 1]?.date !== comparisonDate) {
    rows.push({ date: comparisonDate, actual: comparisonActual ?? undefined })
  }
  return rows
}

export function ForecastChart({
  data,
  label,
  forecastPoint,
  comparison,
  comparisonDate,
  comparisonActual,
}: {
  data: ChartPoint[]
  label: string
  /** The period the question actually asked about, when it's a projection rather than a
   *  recorded actual -- without this the chart only ever shows old history, disconnected from
   *  whatever period the answer above is about. */
  forecastPoint?: ChartPoint | null
  /** Every model's prediction for the same target period, each its own color -- lets a
   *  multi-model run be compared visually instead of only as table rows. */
  comparison?: ComparisonPoint[]
  /** Where to anchor `comparison` dots when there's no single `forecastPoint` (e.g. a
   *  backtest, where the target period already sits inside recorded history). */
  comparisonDate?: string | null
  /** The real held-back value at `comparisonDate`, for a backtest -- lets the actual line run
   *  through the real outcome so the comparison dots read as "distance from what really
   *  happened" rather than floating with nothing to anchor against. */
  comparisonActual?: number | null
}) {
  const rows = buildRows(data, forecastPoint, comparisonDate, comparisonActual)
  const dotX = forecastPoint?.date ?? comparisonDate ?? null

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 dark:text-slate-400">(no chart — underlying series was empty)</p>
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
          <XAxis dataKey="date" tick={{ fontSize: 12.5, fontWeight: 600, fill: 'currentColor' }} className="text-slate-500 dark:text-slate-400" minTickGap={24} />
          <YAxis
            tick={{ fontSize: 12.5, fontWeight: 500, fill: 'currentColor' }}
            className="text-slate-500 dark:text-slate-400"
            width={64}
            tickFormatter={(v: number) => v.toLocaleString()}
          />
          <Tooltip
            formatter={(value, name) => [
              typeof value === 'number' ? value.toLocaleString() : value,
              name === 'forecast' ? `${label} (forecast)` : label,
            ]}
            labelClassName="text-xs"
            contentStyle={{ borderRadius: 12, fontSize: 13, fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="actual"
            name="actual"
            stroke="var(--color-primary-600)"
            dot={false}
            strokeWidth={2.5}
            connectNulls={false}
          />
          {forecastPoint && (
            <Line
              type="monotone"
              dataKey="forecast"
              name="forecast"
              stroke="var(--color-accent-500)"
              strokeWidth={2.5}
              strokeDasharray="7 5"
              dot={{ r: 5, fill: 'var(--color-accent-500)', strokeWidth: 2, stroke: 'white' }}
              connectNulls
            />
          )}
          {dotX &&
            comparison?.map((c) => (
              <ReferenceDot
                key={c.key}
                x={dotX}
                y={c.value}
                r={c.isChampion ? 7.5 : 5.5}
                fill={c.color}
                stroke="white"
                strokeWidth={c.isChampion ? 2.5 : 1.5}
                isFront
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
      {(forecastPoint || (comparison && comparison.length > 0)) && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
          {forecastPoint && (
            <>
              <span className="flex items-center gap-1.5">
                <span className="h-1 w-5 rounded-full bg-primary-600" /> Actual
              </span>
              <span className="flex items-center gap-1.5">
                <span
                  className="h-1 w-5 rounded-full bg-accent-500"
                  style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--color-accent-500) 0 5px, transparent 5px 8px)' }}
                />
                Forecast
              </span>
            </>
          )}
          {comparison?.map((c) => (
            <span key={c.key} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-white shadow-sm" style={{ background: c.color }} />
              {c.label}
              {c.isChampion && <span className="text-[10px] text-amber-500">★</span>}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
