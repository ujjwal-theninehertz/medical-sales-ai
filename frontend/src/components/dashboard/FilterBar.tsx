import type { ReactNode } from 'react'
import { useMetadata } from '../../context/MetadataContext'
import type { DashboardFilters } from '../../types/api'
import { displayName } from '../../utils/displayNames'

const YEARS = [2022, 2023, 2024, 2025, 2026, 2027]
const GRAINS: { value: DashboardFilters['grain']; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
]

const selectClass =
  'rounded-xl border-2 border-slate-300 bg-white px-4 py-2.5 text-base font-semibold text-slate-800 shadow-sm transition hover:border-primary-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-primary-500'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </label>
      {children}
    </div>
  )
}

export function FilterBar({
  filters,
  onChange,
}: {
  filters: DashboardFilters
  onChange: (next: DashboardFilters) => void
}) {
  const { data } = useMetadata()
  if (!data) return null

  const dimensionValues = filters.dimension ? (data.dimension_values[filters.dimension] ?? []) : []

  return (
    <div className="rounded-2xl border-2 border-primary-200 bg-white p-4 shadow-[var(--shadow-card)] dark:border-primary-800/50 dark:bg-slate-900">
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-1 flex items-center gap-1.5 self-center">
          <span aria-hidden className="text-lg">
            🔍
          </span>
          <span className="text-sm font-extrabold uppercase tracking-widest text-primary-700 dark:text-primary-300">
            Filters
          </span>
        </div>

        <Field label="Grain">
          <div
            role="radiogroup"
            aria-label="Grain"
            className="flex gap-1 rounded-xl border-2 border-slate-300 bg-slate-50 p-1 dark:border-slate-600 dark:bg-slate-800"
          >
            {GRAINS.map((g) => (
              <button
                key={g.value}
                type="button"
                role="radio"
                aria-checked={filters.grain === g.value}
                onClick={() => onChange({ ...filters, grain: g.value })}
                className={`rounded-lg px-3.5 py-1.5 text-base font-bold transition ${
                  filters.grain === g.value
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-white hover:text-primary-700 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-primary-300'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </Field>

        {filters.grain === 'year' && (
          <Field label="Year">
            <select
              className={selectClass}
              value={filters.year ?? ''}
              onChange={(e) => onChange({ ...filters, year: e.target.value ? Number(e.target.value) : null })}
              aria-label="Year"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Metric">
          <select
            className={selectClass}
            value={filters.metric}
            onChange={(e) => onChange({ ...filters, metric: e.target.value })}
            aria-label="Metric"
          >
            {Object.entries(data.metric_labels).map(([key, label]) => (
              <option key={key} value={key}>
                {label.charAt(0).toUpperCase() + label.slice(1)}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Scope">
          <select
            className={selectClass}
            value={filters.dimension ?? ''}
            onChange={(e) => onChange({ ...filters, dimension: e.target.value || null, dimension_value: null })}
            aria-label="Dimension"
          >
            <option value="">Whole business</option>
            {Object.keys(data.dimension_values)
              .filter((d) => d !== 'product')
              .map((d) => (
                <option key={d} value={d}>
                  {d.replace('_', ' ')}
                </option>
              ))}
          </select>
        </Field>

        {filters.dimension && (
          <Field label={filters.dimension.replace('_', ' ')}>
            <select
              className={selectClass}
              value={filters.dimension_value ?? ''}
              onChange={(e) => onChange({ ...filters, dimension_value: e.target.value || null })}
              aria-label={`${filters.dimension} value`}
            >
              <option value="">Select {filters.dimension}…</option>
              {dimensionValues.map((v) => (
                <option key={v} value={v}>
                  {displayName(filters.dimension, v)}
                </option>
              ))}
            </select>
          </Field>
        )}

        {(filters.dimension || filters.metric !== 'net_sales' || filters.grain !== 'year') && (
          <button
            type="button"
            onClick={() => onChange({ metric: 'net_sales', dimension: null, dimension_value: null, grain: 'year', year: filters.year })}
            className="ml-auto self-center rounded-xl border-2 border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-600 dark:text-slate-300 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            ✕ Reset
          </button>
        )}
      </div>
    </div>
  )
}
