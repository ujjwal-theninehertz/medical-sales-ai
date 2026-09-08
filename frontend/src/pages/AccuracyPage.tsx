import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ApiError, getBacktests } from '../api/client'
import { Badge, Card, DataTable, SectionHead, Stat } from '../components/shell/primitives'
import type { BacktestsResponse, Grain, WholeBusinessBacktest } from '../types/api'
import { formatCompact } from '../utils/formatNumber'
import { MODEL_COLORS as MODEL_COLOR, MODEL_DOCS } from './modelDocs'

const GRAIN_LABEL: Record<Grain, string> = { week: 'Weekly', month: 'Monthly', year: 'Full-year' }

const ACTUAL_COLOR = 'var(--color-amber-500)'

function fmt(n: number | null | undefined, digits = 0) {
  if (n == null) return '—'
  return n.toLocaleString(undefined, { maximumFractionDigits: digits })
}

function modelLabel(model: string) {
  return MODEL_DOCS[model]?.label ?? model
}

function errTone(v: number | null | undefined) {
  if (v == null) return 'text-slate-400 dark:text-slate-500'
  if (v <= 5) return 'text-emerald-600 dark:text-emerald-400'
  if (v <= 15) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

/** How much better the champion was than the runner-up, in the same statistic the contest was
 *  scored on -- the margin a client actually cares about ("won, but barely" vs "won clean"). */
function margin(w: WholeBusinessBacktest): number | null {
  if (w.scores.length < 2) return null
  return Math.abs(w.scores[1].error_pct ?? 0) - Math.abs(w.scores[0].error_pct ?? 0)
}

function YearlyChart({ w }: { w: WholeBusinessBacktest }) {
  const rows = [
    { name: 'Actual', value: w.actual ?? 0, fill: ACTUAL_COLOR, isActual: true },
    ...w.scores.map((s) => ({
      name: modelLabel(s.model),
      value: s.predicted ?? 0,
      fill: MODEL_COLOR[s.model] ?? 'var(--color-slate-400)',
      isActual: false,
      champion: s.is_champion,
    })),
  ]
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="4 4" className="stroke-slate-200 dark:stroke-slate-800" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 12, fontWeight: 600, fill: 'currentColor' }}
            className="text-slate-600 dark:text-slate-300"
            axisLine={false}
            tickLine={false}
            interval={0}
            angle={-20}
            textAnchor="end"
            height={54}
          />
          <YAxis
            tick={{ fontSize: 12, fontWeight: 500, fill: 'currentColor' }}
            className="text-slate-500 dark:text-slate-400"
            width={56}
            tickFormatter={(v: number) => formatCompact(v)}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [typeof value === 'number' ? value.toLocaleString(undefined, { maximumFractionDigits: 0 }) : value, w.metric_label]}
            contentStyle={{ borderRadius: 14, border: 'none', boxShadow: '0 8px 28px -6px rgb(15 23 42 / 0.25)', fontSize: 13, fontWeight: 600 }}
          />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function MapeChart({ label, entries }: { label: string; entries: { model: string; mape: number | null | undefined }[] }) {
  const rows = entries.map((e) => ({
    name: modelLabel(e.model),
    value: e.mape ?? 0,
    fill: MODEL_COLOR[e.model] ?? 'var(--color-slate-400)',
  }))
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="4 4" className="stroke-slate-200 dark:stroke-slate-800" horizontal={false} />
          <XAxis
            type="number"
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fontSize: 11.5, fontWeight: 600, fill: 'currentColor' }}
            className="text-slate-500 dark:text-slate-400"
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 12, fontWeight: 600, fill: 'currentColor' }}
            className="text-slate-600 dark:text-slate-300"
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(value) => [typeof value === 'number' ? `${value.toFixed(1)}%` : value, `${label} MAPE`]}
            contentStyle={{ borderRadius: 14, border: 'none', boxShadow: '0 8px 28px -6px rgb(15 23 42 / 0.25)', fontSize: 13, fontWeight: 600 }}
          />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {rows.map((r, i) => (
              <Cell key={i} fill={r.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AccuracyPage() {
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: BacktestsResponse | null }>({
    loading: true,
    error: null,
    data: null,
  })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    getBacktests()
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Could not load the model comparison.'
        setState({ loading: false, error: message, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const data = state.data
  const byMetric = (metric: string) => data?.whole_business.filter((w) => w.metric === metric) ?? []
  const netSales = byMetric('net_sales')
  const profit = byMetric('profit')
  const netSalesYear = netSales.find((w) => w.grain === 'year')
  const profitYear = profit.find((w) => w.grain === 'year')
  const allContests = data?.whole_business ?? []

  return (
    <div>
      <SectionHead eyebrow="Actual vs predicted" title="All six models, against the same real number">
        Every model below was trained on 2021–2024 only, then asked to predict 2025 — a year it
        never saw. This is the whole business, every candidate, one real actual: not one scope's
        story, the full six-way contest.
      </SectionHead>

      <AnimatePresence mode="wait">
        {state.loading && (
          <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Card>
              <div className="space-y-2.5">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-3.5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {state.error && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            ⚠️ {state.error}
          </motion.div>
        )}

        {data && !state.loading && !state.error && (
          <motion.div key="data" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <Card>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <Stat label="Models compared" value={data.candidates.length} sub="every contest, every time" />
                <Stat
                  label="Full-year net sales"
                  value={`${fmt(netSalesYear?.scores[0]?.error_pct, 1)}%`}
                  sub={`${modelLabel(netSalesYear?.champion ?? '')} vs. actual`}
                  tone="text-emerald-600 dark:text-emerald-400"
                />
                <Stat label="Monthly net sales MAPE" value={`${fmt(netSales.find((w) => w.grain === 'month')?.scores[0]?.error_pct, 1)}%`} sub="Chronos-2, best in class" />
                <Stat label="Whole-business contests" value={allContests.length} sub={`train ${data.train_period} → test ${data.test_period}`} />
              </div>
            </Card>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[
                { label: 'Net sales', w: netSalesYear },
                { label: 'Profit', w: profitYear },
              ].map(({ label, w }) =>
                w ? (
                  <Card
                    key={label}
                    title={`${label} — full-year ${data.test_period}, all 6 models`}
                    tip="The gold bar is the real recorded total. Every other bar is what that model predicted, having trained only on 2021–2024 — none of them saw this number."
                  >
                    <YearlyChart w={w} />
                    <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                      Real total <b className="text-slate-800 dark:text-slate-200">{fmt(w.actual)}</b> — champion{' '}
                      <b className="text-slate-800 dark:text-slate-200">{modelLabel(w.champion)}</b> landed within{' '}
                      <b className={errTone(Math.abs(w.scores[0].error_pct ?? 0))}>{fmt(Math.abs(w.scores[0].error_pct ?? 0), 1)}%</b>.
                    </p>
                  </Card>
                ) : null,
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {[
                { label: 'Net sales', month: netSales.find((w) => w.grain === 'month'), week: netSales.find((w) => w.grain === 'week') },
                { label: 'Profit', month: profit.find((w) => w.grain === 'month'), week: profit.find((w) => w.grain === 'week') },
              ].map(({ label, month, week }) => (
                <Card key={label} title={`${label} — monthly & weekly MAPE, all 6 models`} tip="Lower is better. MAPE is the mean absolute percentage error across every real period in 2025, not a single year-end number.">
                  {month && (
                    <>
                      <Badge tone="brand">Monthly</Badge>
                      <div className="mt-2">
                        <MapeChart label={`${label} monthly`} entries={month.scores.map((s) => ({ model: s.model, mape: s.mape }))} />
                      </div>
                    </>
                  )}
                  {week && (
                    <>
                      <Badge tone="accent">Weekly</Badge>
                      <div className="mt-2">
                        <MapeChart label={`${label} weekly`} entries={week.scores.map((s) => ({ model: s.model, mape: s.mape }))} />
                      </div>
                    </>
                  )}
                </Card>
              ))}
            </div>

            <Card className="mt-4" title="All 6 whole-business contests" tip="Every metric × grain combination this system has ever scored at whole-business level. Champion margin is how much better the winner was than the runner-up, in the statistic that contest used.">
              <DataTable head={['Contest', 'Statistic', 'Champion', 'Error', 'Won by']}>
                {allContests.map((w) => {
                  const m = margin(w)
                  return (
                    <tr key={`${w.metric}-${w.grain}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-2.5 py-2 text-[15px] font-semibold text-slate-800 dark:text-slate-200">
                        {w.metric_label} · {GRAIN_LABEL[w.grain]}
                      </td>
                      <td className="px-2.5 py-2 text-right">
                        <Badge tone="muted">{w.statistic === 'mape' ? 'MAPE' : 'full-year diff'}</Badge>
                      </td>
                      <td className="px-2.5 py-2 text-right text-[15px] font-bold text-slate-800 dark:text-slate-200">{modelLabel(w.champion)}</td>
                      <td className={`tabular-figure px-2.5 py-2 text-right text-[15px] font-bold ${errTone(Math.abs(w.scores[0].error_pct ?? 0))}`}>
                        {fmt(Math.abs(w.scores[0].error_pct ?? 0), 1)}%
                      </td>
                      <td className="tabular-figure px-2.5 py-2 text-right text-sm font-semibold text-slate-500 dark:text-slate-400">
                        {m != null ? `+${fmt(m, 1)}pp` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </DataTable>
            </Card>

            <div className="mt-4 rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white px-5 py-4 dark:border-primary-800 dark:from-primary-950/40 dark:to-slate-900">
              <div className="flex flex-wrap items-center gap-2.5">
                <span aria-hidden className="text-lg">
                  🎯
                </span>
                <p className="text-sm font-extrabold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                  Read this with two caveats
                </p>
              </div>
              <ul className="mt-2 space-y-2">
                <li className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  <span aria-hidden className="mt-0.5 font-bold text-amber-500 dark:text-amber-400">!</span>
                  <span>
                    <b>A full-year total is a forgiving test.</b> One number against one number lets a
                    heavy month over and a heavy month under cancel out — the monthly MAPE above is
                    the stricter, more honest reading of the same model.
                  </span>
                </li>
                <li className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  <span aria-hidden className="mt-0.5 font-bold text-amber-500 dark:text-amber-400">!</span>
                  <span>
                    <b>This is whole-business only.</b> Individual branches, categories and products
                    each ran their own separate 6-model contest — see Models Tested for how the
                    champion changes once you scope down.
                  </span>
                </li>
              </ul>
              <p className="mt-3 text-sm italic text-slate-500 dark:text-slate-400">
                Accuracy is measured on 2025 only — one real held-back year, not a guarantee about
                every year to come.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
