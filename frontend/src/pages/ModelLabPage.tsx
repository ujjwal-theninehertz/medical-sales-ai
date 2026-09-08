import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { ApiError, runPlayground } from '../api/client'
import { ForecastChart } from '../components/ForecastChart'
import { Badge, Card, Console, DataTable, SectionHead, Stat } from '../components/shell/primitives'
import { useMetadata } from '../context/MetadataContext'
import type { ModelPrediction, PlaygroundResponse } from '../types/api'
import { displayName } from '../utils/displayNames'
import { KIND_LABEL, MODEL_COLORS, MODEL_DOCS } from './modelDocs'

const LIVE_MODELS = ['naive_last_value', 'moving_avg', 'linear_trend', 'seasonal_naive', 'chronos']
const OFFLINE_MODEL = 'claude-haiku-4-5'
const ALL_LAB_MODELS = [...LIVE_MODELS, OFFLINE_MODEL]

const KIND_TONE = { statistical: 'muted', foundation: 'brand', llm: 'accent' } as const

// One real scope per dimension, for the "How a champion gets picked" walkthrough -- each one
// checked to have a different champion at week/month/year, so the point is shown, not just
// claimed. The underlying (dimension, value) are the real internal identifiers; displayName()
// resolves each to what's actually shown.
const CHAMPION_EXAMPLE_SCOPES = [
  { dimension: 'branch', value: 'Medical Branch 01' },
  { dimension: 'route', value: 'Route 01' },
  { dimension: 'category', value: 'Analgesics' },
  { dimension: 'product_type', value: 'Capsule' },
  { dimension: 'customer_type', value: 'Clinic' },
  { dimension: 'supplier', value: 'Medical Supplier 001' },
]

const RECIPE_STEPS = [
  {
    icon: '📝',
    title: 'A practice exam first',
    text: 'Every model is tested on past periods where the real answer is already known — like a mock exam with the answer key.',
  },
  {
    icon: '📏',
    title: 'Every guess gets measured',
    text: 'Each model’s guess is compared to the real number. The gap between them is scored honestly, as a percentage.',
  },
  {
    icon: '🏆',
    title: 'The closest one wins',
    text: 'Whichever model came nearest to the truth becomes the champion — for that exact metric, scope and time period.',
  },
  {
    icon: '🛡️',
    title: 'It still has to clear a bar',
    text: 'Even the winner is rejected if it’s off by more than 40% — a weak guess is never dressed up as a confident answer.',
  },
]

function fmt(n: number | null | undefined, digits = 0) {
  if (n == null) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function errTone(v: number | null | undefined) {
  if (v == null) return 'text-slate-400 dark:text-slate-500'
  if (v <= 10) return 'text-emerald-600 dark:text-emerald-400'
  if (v <= 25) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

// A solid-colour icon chip + label, used at the top of every popup section -- bolder and more
// scannable than a plain emoji-prefixed heading, and gives each section its own colour identity
// at a glance instead of everything reading as one long grey document.
function SectionLabel({ emoji, text, color }: { emoji: string; text: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm shadow-sm ${color}`}>
        {emoji}
      </span>
      <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  )
}

// A small decorative "history -> forecast" glyph for the "Example" box -- illustrative only
// (the real comparison numbers sit in the text beside it), just enough visual shorthand that
// the section reads as a chart, not another paragraph.
function TrendGlyph({ color = 'var(--color-primary-500)' }: { color?: string }) {
  return (
    <svg viewBox="0 0 100 30" className="my-2 h-7 w-full" preserveAspectRatio="none" aria-hidden>
      <path
        d="M2 22 L16 18 L30 20 L44 12 L58 14"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M58 14 L72 16 L86 8 L98 10"
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray="5 4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.65"
      />
      <circle cx="58" cy="14" r="3" fill={color} />
    </svg>
  )
}

function ModelDetailModal({
  modelKey,
  row,
  isChampionHere,
  bestLabel,
  bestMape,
  scopeLabel,
  isBacktest,
  onClose,
}: {
  modelKey: string
  row?: (ModelPrediction & { model: string }) | undefined
  isChampionHere: boolean
  bestLabel: string | null
  bestMape: number | null
  scopeLabel: string
  isBacktest: boolean
  onClose: () => void
}) {
  const doc = MODEL_DOCS[modelKey]

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  if (!doc) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div
          className={`relative overflow-hidden border-b-2 p-6 sm:p-8 ${
            isChampionHere
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-primary-50/40 dark:border-emerald-800 dark:from-emerald-950/40 dark:via-slate-900 dark:to-primary-950/20'
              : 'border-primary-100 bg-gradient-to-br from-primary-50/70 via-white to-accent-50/30 dark:border-primary-900 dark:from-primary-950/30 dark:via-slate-900 dark:to-accent-950/10'
          }`}
        >
          <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 text-[9rem] leading-none opacity-[0.07]">
            {doc.kind === 'llm' ? '✨' : doc.kind === 'foundation' ? '🧠' : '📐'}
          </span>
          <div className="relative flex items-start gap-4">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-3xl bg-white text-3xl shadow-md dark:bg-slate-800">
              {doc.kind === 'llm' ? '✨' : doc.kind === 'foundation' ? '🧠' : '📐'}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <p className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                  {doc.label}
                </p>
                <Badge tone={KIND_TONE[doc.kind]}>{KIND_LABEL[doc.kind]}</Badge>
                {isChampionHere && <Badge tone="good">🏆 Winner this run</Badge>}
              </div>
              <p className="mt-1.5 text-lg text-slate-600 dark:text-slate-400">{doc.oneLiner}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-500 shadow-sm transition hover:bg-white hover:text-slate-800 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              {row && (
                <section className="rounded-2xl border border-primary-200 bg-gradient-to-br from-primary-50 to-white p-4 dark:border-primary-800 dark:from-primary-950/40 dark:to-slate-900">
                  <SectionLabel emoji="🔢" text="What it predicted this time" color="bg-primary-600" />
                  <p className="tabular-figure mt-2.5 text-4xl font-extrabold leading-none text-slate-900 dark:text-slate-50">
                    {fmt(row.value)}
                  </p>
                  {row.live_mape != null ? (
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      <b className={errTone(row.live_mape)}>{row.live_mape.toFixed(1)}% off</b> the real number
                      for <b className="text-slate-800 dark:text-slate-200">{scopeLabel}</b> — about{' '}
                      <b className="text-slate-900 dark:text-slate-100">{Math.max(0, 100 - row.live_mape).toFixed(0)}%</b>{' '}
                      accurate.
                    </p>
                  ) : (
                    <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      This period hasn't happened yet — a genuine forward guess, not a graded one.
                    </p>
                  )}
                </section>
              )}

              <section className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-800 dark:bg-sky-950/20">
                <SectionLabel emoji="🧠" text="How it thinks" color="bg-sky-500" />
                <p className="mt-2 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{doc.simple}</p>
              </section>

              <section className="rounded-2xl border border-violet-200 bg-violet-50/60 p-4 dark:border-violet-800 dark:bg-violet-950/20">
                <SectionLabel emoji="⚙️" text="The actual process" color="bg-violet-600" />
                <ol className="mt-3 space-y-2.5">
                  {doc.mechanism.map((step, i) => (
                    <li key={i} className="flex gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-600 text-[10px] font-extrabold text-white">
                        {i + 1}
                      </span>
                      <span className="text-[13.5px] leading-snug">
                        <b className="font-bold text-slate-900 dark:text-slate-100">{step.title}.</b>{' '}
                        <span className="text-slate-600 dark:text-slate-400">{step.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </section>

              <section className="flex items-center gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 dark:border-amber-800 dark:bg-amber-950/20">
                <div className="min-w-0 flex-1">
                  <SectionLabel emoji="🧮" text="Simple example" color="bg-amber-500" />
                  <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">{doc.example}</p>
                </div>
                <span
                  aria-hidden
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-2xl dark:bg-amber-900/50"
                >
                  🔢
                </span>
              </section>

              <section className="rounded-2xl border border-teal-200 bg-teal-50/60 p-4 dark:border-teal-800 dark:bg-teal-950/20">
                <SectionLabel emoji="📊" text="Where the number comes from" color="bg-teal-600" />
                <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {doc.dataSource} Real history for <b className="text-teal-800 dark:text-teal-300">{scopeLabel}</b> only
                  {isBacktest && (
                    <>
                      {' '}
                      — only data <b className="text-teal-800 dark:text-teal-300">from before this period</b>, so
                      it couldn't have seen the answer.
                    </>
                  )}
                  .
                </p>
              </section>
            </div>

            <div className="space-y-5">
              <section
                className={`rounded-2xl border p-4 ${
                  isChampionHere
                    ? 'border-emerald-300 bg-emerald-50/80 dark:border-emerald-700 dark:bg-emerald-950/30'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60'
                }`}
              >
                <SectionLabel
                  emoji={isChampionHere ? '🏆' : '✅'}
                  text={isChampionHere ? 'Why this one won' : 'Why we trust it when it wins'}
                  color={isChampionHere ? 'bg-emerald-600' : 'bg-slate-500'}
                />
                <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">{doc.trustReason}</p>
                <div className="mt-3 rounded-xl bg-white/80 p-3.5 dark:bg-slate-900/60">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500 text-[11px]">
                      📄
                    </span>
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      Example
                    </p>
                  </div>
                  <TrendGlyph color={MODEL_COLORS[modelKey] ?? 'var(--color-primary-500)'} />
                  {isChampionHere && row?.live_mape != null ? (
                    <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                      For <b className="text-slate-900 dark:text-slate-100">{scopeLabel}</b>,{' '}
                      <b className="text-emerald-700 dark:text-emerald-400">{doc.label}</b> came in{' '}
                      <b className="text-emerald-700 dark:text-emerald-400">{row.live_mape.toFixed(1)}% off</b> — the
                      closest of all 6.
                    </p>
                  ) : !isChampionHere && bestLabel && bestMape != null && row?.live_mape != null ? (
                    <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                      For <b className="text-slate-900 dark:text-slate-100">{scopeLabel}</b>,{' '}
                      <b className="text-slate-900 dark:text-slate-100">{bestLabel}</b> landed{' '}
                      <b className="text-emerald-700 dark:text-emerald-400">{bestMape.toFixed(1)}% off</b>, closer than{' '}
                      {doc.label}'s <b className={errTone(row.live_mape)}>{row.live_mape.toFixed(1)}%</b>.
                    </p>
                  ) : (
                    <p className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                      {doc.label} predicts closest on one scope — even if another model wins the total. Each scope
                      runs its own contest.
                    </p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-800 dark:bg-emerald-950/20">
                <SectionLabel emoji="👍" text="Good at" color="bg-emerald-600" />
                <p className="mt-2 text-[13.5px] leading-relaxed text-slate-700 dark:text-slate-300">{doc.strength}</p>
              </section>

              <section className="rounded-2xl border-2 border-dashed border-primary-200 bg-primary-50/50 p-4 dark:border-primary-800 dark:bg-primary-950/20">
                <SectionLabel emoji="💬" text="In plain words" color="bg-primary-600" />
                <p className="mt-2 text-[15px] font-semibold leading-relaxed text-slate-800 dark:text-slate-200">
                  {doc.tldr}
                </p>
              </section>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function ModelLabPage() {
  const { data } = useMetadata()

  const [selected, setSelected] = useState('chronos')
  const [dimension, setDimension] = useState('Whole business')
  const [dimensionValue, setDimensionValue] = useState('')
  const [metric, setMetric] = useState('net_sales')
  const [year, setYear] = useState('2025')
  const [month, setMonth] = useState('')

  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<PlaygroundResponse | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  // Which model's explainer popup is open -- separate from `selected` (which also drives the
  // table highlight and the chart's champion star) so opening/closing the popup never disturbs
  // those.
  const [modalModel, setModalModel] = useState<string | null>(null)

  const dimensionValues = useMemo(
    () => (dimension === 'Whole business' ? [] : (data?.dimension_values[dimension] ?? [])),
    [data, dimension],
  )

  // "How a champion gets picked" below reads real, already-computed data -- never a live
  // lookup, never a run. Same three grain tables the rest of the app uses.
  const championMapsByGrain = {
    week: data?.dimensional_champions_week,
    month: data?.dimensional_champions,
    year: data?.dimensional_champions_year,
  } as const
  const championCoverage = {
    week: Object.values(data?.dimensional_champions_week ?? {}).reduce((n, v) => n + Object.keys(v).length, 0),
    month: Object.values(data?.dimensional_champions ?? {}).reduce((n, v) => n + Object.keys(v).length, 0),
    year: Object.values(data?.dimensional_champions_year ?? {}).reduce((n, v) => n + Object.keys(v).length, 0),
  }
  // One real, named example per dimension -- picked because its champion genuinely differs
  // across at least two grains, so the point ("the same scope, a different winner, depending
  // only on the time grain") is visible at a glance rather than asserted.
  const championExamples = CHAMPION_EXAMPLE_SCOPES.map(({ dimension: dim, value }) => ({
    dimension: dim,
    value,
    label: displayName(dim, value),
    week: championMapsByGrain.week?.[dim]?.[value],
    month: championMapsByGrain.month?.[dim]?.[value],
    year: championMapsByGrain.year?.[dim]?.[value],
  }))
  // How often each model won, across all real dimension values, at each grain -- the
  // statistical picture behind the named examples above.
  const winCounts = (['week', 'month', 'year'] as const).reduce(
    (acc, grain) => {
      const counts: Record<string, number> = {}
      for (const values of Object.values(championMapsByGrain[grain] ?? {})) {
        for (const info of Object.values(values)) counts[info.model] = (counts[info.model] ?? 0) + 1
      }
      acc[grain] = Object.entries(counts).sort((a, b) => b[1] - a[1])
      return acc
    },
    {} as Record<'week' | 'month' | 'year', [string, number][]>,
  )

  async function run() {
    setRunning(true)
    setRunError(null)
    setResult(null)
    try {
      const res = await runPlayground({
        metric,
        dimension: dimension === 'Whole business' ? null : dimension,
        dimension_value: dimensionValue || null,
        year: year || null,
        month: month || null,
        freq: 'month',
        periods_ahead: 1,
      })
      setResult(res)
      if (res.validation_errors?.length) setRunError(res.validation_errors.join(' · '))
      else if (res.error) setRunError(res.error)
    } catch (err) {
      setRunError(err instanceof ApiError ? err.message : 'Could not reach the model service.')
    } finally {
      setRunning(false)
    }
  }

  const rows = result?.predictions
    ? Object.entries(result.predictions).map(([model, p]) => ({ model, ...p }))
    : []
  const ranked = [...rows].sort((a, b) => {
    const av = a.live_mape ?? a.historical_mape ?? Infinity
    const bv = b.live_mape ?? b.historical_mape ?? Infinity
    return av - bv
  })
  const bestHere = ranked.find((r) => r.live_mape != null)?.model
  const selectedRow = rows.find((r) => r.model === selected)
  const selectClass =
    'rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-primary-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100'

  return (
    <div>
      <SectionHead eyebrow="Model selection & live processing" title="Which model, and why">
        Pick a model, choose the scope and the target period, then press <b>Run</b>. Every step the
        engine takes appears in the processing log as it happens — data loading, the train/test
        split, each model's own input window and raw output, then the scoring. Because the target
        below sits inside recorded history, the held-back actual is known, so this is a genuine
        backtest rather than a claim.
      </SectionHead>

      {/* ---------- model cards ---------- */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_LAB_MODELS.map((m, i) => {
          const d = MODEL_DOCS[m]
          const isSel = m === selected
          const row = rows.find((r) => r.model === m)
          return (
            <motion.button
              key={m}
              type="button"
              onClick={() => {
                setSelected(m)
                setModalModel(m)
              }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              whileHover={{ y: -2 }}
              className={`group relative rounded-2xl border-2 p-4 text-left transition ${
                isSel
                  ? 'border-primary-500 bg-primary-50/70 shadow-[var(--shadow-card-hover)] dark:border-primary-400 dark:bg-primary-950/40'
                  : 'border-slate-200 bg-white hover:border-primary-300 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-extrabold text-slate-900 dark:text-slate-50">{d.label}</p>
                {m === bestHere && <Badge tone="good">★ Best here</Badge>}
              </div>
              <div className="mt-1.5">
                <Badge tone={KIND_TONE[d.kind]}>{KIND_LABEL[d.kind]}</Badge>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{d.oneLiner}</p>
              {row && (
                <p className={`tabular-figure mt-2 text-lg font-extrabold ${errTone(row.live_mape)}`}>
                  {fmt(row.value)}
                  {row.live_mape != null && (
                    <span className="ml-1.5 text-[11px] font-bold">({row.live_mape.toFixed(1)}% off)</span>
                  )}
                </p>
              )}
              {m === OFFLINE_MODEL && (
                <p className="mt-2 text-[10.5px] font-semibold uppercase tracking-wide text-accent-700 dark:text-accent-300">
                  Scored offline — not run live
                </p>
              )}
              <span className="absolute bottom-3 right-4 text-[10px] font-bold uppercase tracking-wide text-primary-500 opacity-0 transition-opacity group-hover:opacity-80 dark:text-primary-400">
                Tap to explain →
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* ---------- controls ---------- */}
      <Card className="mt-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Scope
            </p>
            <select
              className={selectClass}
              value={dimension}
              onChange={(e) => {
                setDimension(e.target.value)
                setDimensionValue('')
              }}
              aria-label="Scope"
            >
              {(data?.playground_dimensions ?? ['Whole business']).map((d) => (
                <option key={d} value={d}>
                  {d === 'Whole business' ? d : d.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {dimension !== 'Whole business' && (
            <div>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {dimension.replace('_', ' ')}
              </p>
              <select
                className={selectClass}
                value={dimensionValue}
                onChange={(e) => setDimensionValue(e.target.value)}
                aria-label="Scope value"
              >
                <option value="">Select…</option>
                {dimensionValues.map((v) => (
                  <option key={v} value={v}>
                    {displayName(dimension, v)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Metric
            </p>
            <select
              className={selectClass}
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
              aria-label="Metric"
            >
              {Object.entries(data?.playground_metric_labels ?? {}).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Year
            </p>
            <select className={selectClass} value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year">
              {['2022', '2023', '2024', '2025', '2026'].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Month
            </p>
            <select className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month">
              <option value="">Whole year</option>
              {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
                'September', 'October', 'November', 'December'].map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={run}
            disabled={running || (dimension !== 'Whole business' && !dimensionValue)}
            className="flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
          >
            {running ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Running…
              </>
            ) : (
              <>▶ Run all models</>
            )}
          </button>

          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            {running ? (
              'training on data strictly before the target…'
            ) : result ? (
              <>
                <b className="text-slate-700 dark:text-slate-300">
                  {result.year_only ? `Full year ${year}` : result.target_period ?? ''}
                </b>{' '}
                — {result.is_backtest ? 'real backtest, actual known and held back' : 'forward forecast, no actual yet'}
              </>
            ) : (
              'ready'
            )}
          </p>
        </div>

        {runError && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ {runError}
          </div>
        )}
      </Card>

      {/* ---------- log + result ---------- */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Processing log"
          tip="Every line is real output emitted by the forecasting engine during this run — the resolved target, the exact train/test split, each model's input window and raw output, its score, and the final ranking. Nothing here is written after the fact."
        >
          <Console
            lines={result?.log ?? []}
            placeholder="Press ▶ Run all models to watch the engine work…"
            revealMs={70}
          />
        </Card>

        <Card title="Result: what each model produced">
          {!result?.predictions ? (
            <div className="flex h-72 items-center justify-center text-sm text-slate-400 dark:text-slate-500">
              No run yet.
            </div>
          ) : (
            <>
              {result.actual_value != null && (
                <div className="mb-3 grid grid-cols-2 gap-3 rounded-xl border-2 border-primary-200 bg-primary-50/60 p-3 dark:border-primary-800 dark:bg-primary-950/40">
                  <Stat label="Actual (held back)" value={fmt(result.actual_value)} />
                  <Stat
                    label={`Best model here`}
                    value={bestHere ? MODEL_DOCS[bestHere].label : '—'}
                    sub={
                      bestHere
                        ? `${rows.find((r) => r.model === bestHere)?.live_mape?.toFixed(1)}% off the actual`
                        : undefined
                    }
                  />
                </div>
              )}
              <DataTable head={['Model', 'Predicted', 'This test', 'Offline MAPE']}>
                {ranked.map((r) => (
                  <tr
                    key={r.model}
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
                      r.model === selected ? 'bg-primary-50/60 dark:bg-primary-950/30' : ''
                    }`}
                  >
                    <td className="px-2.5 py-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelected(r.model)
                          setModalModel(r.model)
                        }}
                        className="flex items-center gap-2 text-left text-[15px] font-bold text-slate-800 hover:text-primary-600 hover:underline dark:text-slate-200 dark:hover:text-primary-400"
                      >
                        <span
                          aria-hidden
                          className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm dark:border-slate-900"
                          style={{ background: MODEL_COLORS[r.model] ?? 'var(--color-slate-400)' }}
                        />
                        {MODEL_DOCS[r.model]?.label ?? r.model}
                      </button>
                    </td>
                    <td className="tabular-figure px-2.5 py-2 text-right text-slate-700 dark:text-slate-300">
                      {fmt(r.value)}
                    </td>
                    <td className={`tabular-figure px-2.5 py-2 text-right font-bold ${errTone(r.live_mape)}`}>
                      {r.live_mape != null ? `${r.live_mape.toFixed(1)}%` : '—'}
                    </td>
                    <td className="tabular-figure px-2.5 py-2 text-right text-slate-500 dark:text-slate-400">
                      {r.historical_mape != null ? `${r.historical_mape.toFixed(1)}%` : 'never tested'}
                    </td>
                  </tr>
                ))}
                {Object.entries(result.failures ?? {}).map(([model, err]) => (
                  <tr key={model} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-2.5 py-2 text-[15px] font-bold text-slate-800 dark:text-slate-200">
                      {MODEL_DOCS[model]?.label ?? model}
                    </td>
                    <td colSpan={3} className="px-2.5 py-2 text-right text-sm text-red-600 dark:text-red-400">
                      failed — {err}
                    </td>
                  </tr>
                ))}
              </DataTable>
              {result.claude_historical_mape != null && (
                <p className="mt-3 rounded-xl bg-accent-50 px-3 py-2 text-sm font-medium text-accent-800 dark:bg-accent-950/50 dark:text-accent-200">
                  Claude Haiku 4.5 scored <b>{result.claude_historical_mape.toFixed(1)}% MAPE</b> on
                  this exact scope in the offline backtest. It isn't re-run live here — it costs a
                  network call per forecast, so it competes offline and is used only where it won.
                </p>
              )}
              <div className="mt-3">
                <ForecastChart
                  data={result.history_chart}
                  label={result.metric ?? 'value'}
                  forecastPoint={
                    !result.is_backtest && result.target_period && selectedRow
                      ? { date: result.target_period, value: selectedRow.value }
                      : null
                  }
                  comparisonDate={result.target_period}
                  comparisonActual={result.actual_value}
                  comparison={ranked.map((r) => ({
                    key: r.model,
                    label: MODEL_DOCS[r.model]?.label ?? r.model,
                    value: r.value,
                    color: MODEL_COLORS[r.model] ?? 'var(--color-slate-400)',
                    isChampion: r.model === bestHere,
                  }))}
                />
              </div>
            </>
          )}
        </Card>
      </div>

      {/* ---------- how a champion gets picked ---------- */}
      <Card className="mt-4">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-600 dark:text-accent-400">
          The actual recipe
        </p>
        <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          How a champion gets picked
        </h3>
        <p className="mt-1.5 max-w-3xl text-base leading-relaxed text-slate-600 dark:text-slate-400">
          Before anyone asks a question, every real part of the business — every branch, route,
          category, product, customer type and supplier — is already tested{' '}
          <b className="text-slate-800 dark:text-slate-200">three separate times</b>: once as if
          the question is about a week, once about a month, once about a full year. That's{' '}
          <b className="text-slate-800 dark:text-slate-200">302 real scopes, tested 3 ways each</b>
          , 6 models competing every single time. A winner is written down for each one — so when
          a question actually arrives, nothing is decided. It's just looked up.
        </p>

        <div className="mt-4 grid grid-cols-3 gap-3">
          {(['week', 'month', 'year'] as const).map((g) => (
            <div key={g} className="rounded-2xl border-2 border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
              <p className="tabular-figure text-2xl font-extrabold text-slate-900 dark:text-slate-50">
                {championCoverage[g]}
              </p>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                scopes tested · {g}
              </p>
            </div>
          ))}
        </div>

        {/* ---------- real, named examples: same scope, different grain, different winner ---------- */}
        <div className="mt-5">
          <p className="text-sm font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            🧾 Six real examples, one from each dimension
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Same real place or product, three grains. Watch the winner change.
          </p>
          <div className="mt-3">
            <DataTable head={['Real scope', 'Week', 'Month', 'Year']}>
              {championExamples.map((ex) => (
                <tr key={`${ex.dimension}-${ex.value}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-2.5 py-3">
                    <p className="text-[15px] font-bold text-slate-800 dark:text-slate-200">{ex.label}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {ex.dimension.replace('_', ' ')}
                    </p>
                  </td>
                  {(['week', 'month', 'year'] as const).map((g) => {
                    const c = ex[g]
                    return (
                      <td key={g} className="px-2.5 py-3 text-right">
                        {c ? (
                          <>
                            <span className="inline-flex items-center justify-end gap-1.5">
                              <span
                                aria-hidden
                                className="h-2.5 w-2.5 shrink-0 rounded-full border border-white shadow-sm dark:border-slate-900"
                                style={{ background: MODEL_COLORS[c.model] ?? 'var(--color-slate-400)' }}
                              />
                              <span className="text-[15px] font-bold text-slate-800 dark:text-slate-200">
                                {MODEL_DOCS[c.model]?.label ?? c.model}
                              </span>
                            </span>
                            {c.error_pct != null && (
                              <p className="tabular-figure text-xs font-semibold text-slate-500 dark:text-slate-400">
                                ±{c.error_pct.toFixed(1)}% error
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">not validated</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </DataTable>
          </div>
        </div>

        {/* ---------- the graph: how often each model wins, at each grain, across all 302 ---------- */}
        <div className="mt-6">
          <p className="text-sm font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-300">
            📊 Who wins, how often — across all 302
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            No single model dominates. Which one wins depends on the grain — that's the whole
            reason six candidates compete instead of picking one favourite in advance.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {(['week', 'month', 'year'] as const).map((g) => {
              const entries = winCounts[g]
              const max = Math.max(...entries.map(([, c]) => c), 1)
              return (
                <div key={g} className="rounded-2xl border-2 border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {g} grain
                  </p>
                  <div className="mt-2.5 space-y-2">
                    {entries.map(([model, count]) => (
                      <div key={model}>
                        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                          <span className="truncate">{MODEL_DOCS[model]?.label ?? model}</span>
                          <span className="tabular-figure shrink-0 pl-2">{count}</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${(count / max) * 100}%`,
                              background: MODEL_COLORS[model] ?? 'var(--color-slate-400)',
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {bestHere && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50/70 px-4 py-3 dark:border-emerald-800 dark:bg-emerald-950/30">
            <span aria-hidden className="text-2xl">
              🏆
            </span>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              And from the live run above:{' '}
              <b className="text-slate-900 dark:text-slate-50">{MODEL_DOCS[bestHere]?.label ?? bestHere}</b> won —
              it landed only{' '}
              <b className="text-emerald-700 dark:text-emerald-400">
                {rows.find((r) => r.model === bestHere)?.live_mape?.toFixed(1)}%
              </b>{' '}
              from the real number, closer than every other approach.
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {RECIPE_STEPS.map((step, i) => (
            <div key={step.title} className="relative">
              <div className="h-full rounded-2xl border-2 border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-600 text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span aria-hidden className="text-xl">
                    {step.icon}
                  </span>
                </div>
                <p className="mt-2.5 text-[15px] font-extrabold text-slate-900 dark:text-slate-50">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{step.text}</p>
              </div>
              {i < RECIPE_STEPS.length - 1 && (
                <span
                  aria-hidden
                  className="absolute right-[-11px] top-1/2 z-10 hidden -translate-y-1/2 text-lg font-bold text-slate-300 dark:text-slate-700 lg:block"
                >
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <AnimatePresence>
        {modalModel && (
          <ModelDetailModal
            modelKey={modalModel}
            row={rows.find((r) => r.model === modalModel)}
            isChampionHere={modalModel === bestHere}
            bestLabel={bestHere ? (MODEL_DOCS[bestHere]?.label ?? bestHere) : null}
            bestMape={bestHere ? (rows.find((r) => r.model === bestHere)?.live_mape ?? null) : null}
            scopeLabel={
              dimension === 'Whole business'
                ? 'the whole business'
                : `${dimension.replace('_', ' ')} = ${dimensionValue ? displayName(dimension, dimensionValue) : '—'}`
            }
            isBacktest={result?.is_backtest ?? false}
            onClose={() => setModalModel(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
