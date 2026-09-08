import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ApiError, getScopeMatrix } from '../../api/client'
import { useMetadata } from '../../context/MetadataContext'
import { MODEL_DOCS } from '../../pages/modelDocs'
import type { ScopeMatrix } from '../../types/api'
import { displayName } from '../../utils/displayNames'
import { formatCompact, formatPct } from '../../utils/formatNumber'
import { Badge, Card, InfoTip } from '../shell/primitives'

const MATRIX_DIMENSIONS = ['branch', 'route', 'category', 'product_type', 'customer_type', 'supplier']
const MAX_ROWS = 12

type Direction = ScopeMatrix['rows'][number]['direction']

function magnitudeTier(pct?: number | null): 0 | 1 | 2 {
  const v = Math.abs(pct ?? 0)
  if (v >= 10) return 2
  if (v >= 3) return 1
  return 0
}

// A heat-map, not a list: hue carries direction, and how SATURATED that hue is scales with
// how big the move was -- a client should be able to spot the standout tiles before reading
// a single number. Text/icon stay one fixed strong shade per direction so they never wash out
// against the palest tier.
const TILE_BG: Record<Direction, [string, string, string]> = {
  increase: [
    'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/45',
    'bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/45 dark:hover:bg-emerald-900/60',
    'bg-emerald-200 hover:bg-emerald-300 dark:bg-emerald-900/70 dark:hover:bg-emerald-800/80',
  ],
  decrease: [
    'bg-red-50 hover:bg-red-100 dark:bg-red-950/25 dark:hover:bg-red-950/45',
    'bg-red-100 hover:bg-red-200 dark:bg-red-950/45 dark:hover:bg-red-900/60',
    'bg-red-200 hover:bg-red-300 dark:bg-red-900/70 dark:hover:bg-red-800/80',
  ],
  flat: [
    'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700',
    'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700',
    'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700',
  ],
}
const TILE_TEXT: Record<Direction, string> = {
  increase: 'text-emerald-700 dark:text-emerald-300',
  decrease: 'text-red-700 dark:text-red-300',
  flat: 'text-slate-500 dark:text-slate-400',
}
const TILE_ICON: Record<Direction, string> = { increase: '↑', decrease: '↓', flat: '→' }

function accuracyDot(v: number | null | undefined) {
  if (v == null) return 'bg-slate-300 dark:bg-slate-600'
  if (v <= 10) return 'bg-emerald-500'
  if (v <= 25) return 'bg-amber-500'
  return 'bg-red-500'
}

function modelTitle(r: { champion_model?: string | null; champion_error_pct?: number | null }) {
  const label = r.champion_model ? (MODEL_DOCS[r.champion_model]?.label ?? r.champion_model) : 'Model'
  const err = r.champion_error_pct != null ? `±${r.champion_error_pct.toFixed(0)}% error` : 'validated'
  return `${label} · ${err}`
}

export function ScopeMatrixPanel({
  metric,
  grain,
  onDrillTo,
}: {
  metric: string
  grain: 'week' | 'month' | 'year'
  onDrillTo?: (dimension: string, value: string) => void
}) {
  const { data: meta } = useMetadata()
  const [dimension, setDimension] = useState('branch')
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: ScopeMatrix | null }>({
    loading: true,
    error: null,
    data: null,
  })
  // Purely a same-tick visual acknowledgement that THIS tile's click registered -- independent
  // of any fetch, since drilling doesn't necessarily make this panel itself refetch. Without
  // this a click gave zero feedback before the page scrolled away, which read as "nothing
  // happened" and invited a second click.
  const [pending, setPending] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    getScopeMatrix(metric, grain, dimension)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          loading: false,
          error: err instanceof ApiError ? err.message : 'Could not load scope status.',
          data: null,
        })
      })
    return () => {
      cancelled = true
    }
  }, [metric, grain, dimension])

  const rows = state.data?.rows ?? []
  const shown = rows.slice(0, MAX_ROWS)
  const notForecastable = rows.filter((r) => !r.forecastable).length

  return (
    <Card
      title={`Status by ${dimension.replace('_', ' ')}`}
      tip="Every value of this dimension, at the grain selected above: its latest complete period, how that compares with the period before, and whether this system has a validated model for that exact scope at that grain. A scope with no validated model is shown as such rather than quietly left out. Tile size marks the largest values; tile color intensity marks the size of the move."
      action={
        <div className="flex flex-wrap items-center gap-2">
          {state.loading && state.data && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400" />
              Updating
            </span>
          )}
          {state.data?.comparison_label && state.data?.period_label && (
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {state.data.comparison_label} → {state.data.period_label}
            </span>
          )}
          <select
            value={dimension}
            onChange={(e) => setDimension(e.target.value)}
            aria-label="Dimension"
            className="rounded-lg border-2 border-slate-300 bg-white px-2.5 py-1.5 text-sm font-bold capitalize text-slate-700 transition hover:border-primary-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          >
            {MATRIX_DIMENSIONS.filter((d) => (meta?.dimension_values[d] ?? []).length > 0).map((d) => (
              <option key={d} value={d}>
                {d.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {state.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          ⚠️ {state.error}
        </div>
      )}

      {state.loading && !state.data && (
        <div className="grid auto-rows-[minmax(112px,auto)] grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <div className="col-span-2 row-span-2 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      )}

      {state.data && (
        <>
          <div
            className={`grid auto-rows-[minmax(112px,auto)] grid-cols-2 gap-2.5 transition-opacity duration-200 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 ${
              state.loading ? 'opacity-50' : 'opacity-100'
            }`}
          >
            {shown.map((r, i) => {
              const isHero = i === 0
              const tier = magnitudeTier(r.delta_pct)
              const isPending = pending === r.value
              return (
                <motion.button
                  key={r.value}
                  type="button"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2, delay: i * 0.02 }}
                  onClick={() => {
                    // Immediate, same-tick feedback that the click landed -- the actual effect
                    // (KPIs/chart above updating) can take a few seconds and happens off-screen.
                    setPending(r.value)
                    onDrillTo?.(state.data!.dimension, r.value)
                    window.setTimeout(() => setPending((p) => (p === r.value ? null : p)), 1000)
                  }}
                  disabled={!onDrillTo}
                  title={r.forecastable ? modelTitle(r) : 'No validated model for this scope'}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border p-3.5 text-left transition enabled:cursor-pointer disabled:cursor-default ${
                    isHero ? 'col-span-2 row-span-2 p-5' : ''
                  } ${isPending ? 'border-primary-400 ring-2 ring-primary-400' : 'border-transparent'} ${
                    TILE_BG[r.direction][tier]
                  }`}
                >
                  <span className="absolute right-3 top-3">
                    {r.forecastable ? (
                      <span aria-hidden className={`block h-2 w-2 rounded-full ${accuracyDot(r.champion_error_pct)}`} />
                    ) : (
                      <Badge tone="warn">no model</Badge>
                    )}
                  </span>

                  <p className={`truncate pr-4 font-bold text-slate-800 dark:text-slate-100 ${isHero ? 'text-base' : 'text-sm'}`}>
                    {displayName(dimension, r.value)}
                  </p>

                  <div className="mt-2">
                    <p
                      className={`tabular-figure font-extrabold leading-none ${TILE_TEXT[r.direction]} ${
                        isHero ? 'text-3xl' : 'text-xl'
                      }`}
                    >
                      {TILE_ICON[r.direction]} {formatPct(r.delta_pct)}
                    </p>
                    <p
                      className={`tabular-figure mt-1.5 font-semibold text-slate-500 dark:text-slate-400 ${
                        isHero ? 'text-sm' : 'text-xs'
                      }`}
                    >
                      {formatCompact(r.target)}
                      {isHero && r.champion_model && (
                        <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">
                          · {MODEL_DOCS[r.champion_model]?.label ?? r.champion_model}
                        </span>
                      )}
                    </p>
                  </div>

                  {isPending && (
                    <span className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/80 dark:bg-slate-950/80">
                      <span className="flex items-center gap-1.5 rounded-full bg-primary-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                        <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        loading ↑
                      </span>
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2.5 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              {rows.length} {dimension.replace('_', ' ')} values
              {rows.length > MAX_ROWS && <> · showing the {MAX_ROWS} largest</>}
            </span>
            <span className="flex items-center gap-1.5">
              {notForecastable > 0 ? (
                <>
                  {notForecastable} without a validated {grain} model
                  <InfoTip>
                    Either no champion was ever established for that scope at this grain, or the
                    champion that won was itself measured above the 40% error floor — in both cases
                    the system refuses to forecast it rather than showing a number it cannot stand
                    behind.
                  </InfoTip>
                </>
              ) : (
                <>every scope here has a validated {grain} model</>
              )}
            </span>
          </div>
        </>
      )}
    </Card>
  )
}
