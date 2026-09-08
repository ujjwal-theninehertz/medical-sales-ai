import { motion } from 'framer-motion'
import { Badge, Card, DataTable, InfoTip, SectionHead, Stat } from '../components/shell/primitives'

type Tone = 'good' | 'warn' | 'bad' | 'brand' | 'accent' | 'muted'

const SCALE: { label: string; value: string; sub: string }[] = [
  { label: 'Transaction rows', value: '250,000', sub: 'real recorded line items' },
  { label: 'History covered', value: '2021–2025', sub: 'Jan 2021 → Dec 2025' },
  { label: 'Scope levels', value: '8', sub: 'whole business + 7 dimensions' },
  { label: 'Validated metrics', value: '4', sub: 'net sales, gross sales, profit, units' },
]

const PROBLEM: string[] = [
  '5 years, 250,000 rows — no forward view',
  'Planning stuck on last year’s shape',
  '“Why did sales move?” = manual guesswork',
  'No track record = no trust',
]

const OBJECTIVE: string[] = [
  'Plain-English answers — 4 metrics, 8 scopes, any grain',
  'Every figure grounded in real transaction rows',
  'Model + measured error shown with every answer',
  'Refuses questions the data can’t support',
]

const APPROACH: { n: string; icon: string; title: string; points: string[]; badge: string; tone: Tone }[] = [
  {
    n: '01',
    icon: '📊',
    title: 'Score, never assume',
    points: ['6 candidate models, 1 real holdout', 'Accuracy measured on unseen 2025 data'],
    badge: '881 contests',
    tone: 'brand',
  },
  {
    n: '02',
    icon: '🏆',
    title: 'A champion per contest',
    points: ['Winner picked per metric × scope × grain', 'Decided offline, before any question is asked'],
    badge: 'per scope × grain',
    tone: 'accent',
  },
  {
    n: '03',
    icon: '🛡️',
    title: 'Gate before showing',
    points: ['Error over 40% = refused, not shown', 'Thin scopes never scored', 'Confidence fades with distance'],
    badge: '40% floor',
    tone: 'warn',
  },
  {
    n: '04',
    icon: '✨',
    title: 'AI narrates, never computes',
    points: ['AI explains numbers, never calculates them', 'Every figure verified against the text'],
    badge: 'grounded',
    tone: 'good',
  },
]

const FINDING: string[] = [
  'No single model wins everywhere',
  'Chronos-2 — 173/277 weekly contests',
  'Linear trend leads yearly — 76/302',
  'Naive baseline still takes 57 weekly',
  'Champion picked per metric × scope × grain',
]

const CANDIDATES: { label: string; kind: string; tone: Tone; oneLiner: string; monthly: number; weekly: number }[] = [
  {
    label: 'Chronos-2',
    kind: 'Foundation',
    tone: 'brand',
    oneLiner: 'Amazon’s pretrained time-series foundation model.',
    monthly: 2.9,
    weekly: 4.7,
  },
  {
    label: 'Claude Haiku 4.5',
    kind: 'LLM',
    tone: 'accent',
    oneLiner: 'Given the raw numeric history, JSON-constrained.',
    monthly: 3.9,
    weekly: 17.2,
  },
  {
    label: 'Seasonal naive',
    kind: 'Baseline',
    tone: 'muted',
    oneLiner: 'Repeats the same period one year back.',
    monthly: 4.0,
    weekly: 7.0,
  },
  {
    label: 'Linear trend',
    kind: 'Baseline',
    tone: 'muted',
    oneLiner: 'Extrapolates the straight-line trend.',
    monthly: 8.4,
    weekly: 8.5,
  },
  {
    label: 'Moving average',
    kind: 'Baseline',
    tone: 'muted',
    oneLiner: 'Averages recent months or weeks.',
    monthly: 12.8,
    weekly: 15.2,
  },
  {
    label: 'Naive (last value)',
    kind: 'Baseline',
    tone: 'muted',
    oneLiner: 'Repeats the last known value.',
    monthly: 24.6,
    weekly: 21.8,
  },
]

const WINS: { label: string; monthly: number; weekly: number; yearly: number }[] = [
  { label: 'Chronos-2', monthly: 103, weekly: 173, yearly: 59 },
  { label: 'Claude Haiku 4.5', monthly: 83, weekly: 14, yearly: 62 },
  { label: 'Seasonal naive', monthly: 52, weekly: 3, yearly: 57 },
  { label: 'Linear trend', monthly: 28, weekly: 15, yearly: 76 },
  { label: 'Moving average', monthly: 20, weekly: 15, yearly: 37 },
  { label: 'Naive (last value)', monthly: 16, weekly: 57, yearly: 11 },
]

const DIMENSIONS: { name: string; values: number }[] = [
  { name: 'Branch', values: 15 },
  { name: 'Route', values: 30 },
  { name: 'Category', values: 15 },
  { name: 'Product type', values: 7 },
  { name: 'Customer type', values: 5 },
  { name: 'Supplier', values: 30 },
  { name: 'Product', values: 200 },
]

const ACTUAL_2025 = 37_192_817
const PREDICTED_2025 = 36_746_052

function errTone(v: number) {
  if (v <= 5) return 'text-emerald-600 dark:text-emerald-400'
  if (v <= 15) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

export function BriefPage() {
  const totals = WINS.reduce(
    (acc, w) => ({
      monthly: acc.monthly + w.monthly,
      weekly: acc.weekly + w.weekly,
      yearly: acc.yearly + w.yearly,
    }),
    { monthly: 0, weekly: 0, yearly: 0 },
  )
  const best = {
    monthly: Math.max(...WINS.map((w) => w.monthly)),
    weekly: Math.max(...WINS.map((w) => w.weekly)),
    yearly: Math.max(...WINS.map((w) => w.yearly)),
  }
  const predictedWidth = (PREDICTED_2025 / ACTUAL_2025) * 100

  return (
    <div>
      <SectionHead eyebrow="Project brief" title="Forecasting a distribution business, provably">
        A medical &amp; pharmaceutical distributor with five years of transaction history — and no
        forward view of it. This system turns that history into plain-English answers, each one
        backed by a measured accuracy record.
      </SectionHead>

      <Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SCALE.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.05 }}
            >
              <Stat label={s.label} value={s.value} sub={s.sub} />
            </motion.div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="The problem">
          <ul className="space-y-2.5">
            {PROBLEM.map((p) => (
              <li key={p} className="flex gap-2.5 text-base leading-relaxed text-slate-700 dark:text-slate-300">
                <span aria-hidden className="mt-0.5 font-bold text-red-500 dark:text-red-400">
                  ✕
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="The objective">
          <ul className="space-y-2.5">
            {OBJECTIVE.map((o) => (
              <li key={o} className="flex gap-2.5 text-base leading-relaxed text-slate-700 dark:text-slate-300">
                <span aria-hidden className="mt-0.5 font-bold text-emerald-500 dark:text-emerald-400">
                  ✓
                </span>
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-8">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary-600 dark:text-primary-400">
          The approach
        </p>
        <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          Four rules the whole system is built on
        </h3>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {APPROACH.map((a, i) => (
          <motion.div
            key={a.n}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: i * 0.05 }}
            className="flex flex-col rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-[var(--shadow-card)] dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="tabular-figure text-xs font-bold text-slate-400 dark:text-slate-500">{a.n}</span>
              <span aria-hidden className="text-base">
                {a.icon}
              </span>
            </div>
            <p className="mt-2 text-base font-extrabold text-slate-900 dark:text-slate-50">{a.title}</p>
            <ul className="mt-1.5 flex-1 space-y-1">
              {a.points.map((p) => (
                <li key={p} className="flex gap-1.5 text-base leading-snug text-slate-600 dark:text-slate-400">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <Badge tone={a.tone}>{a.badge}</Badge>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Six candidates, one real holdout"
          tip="Whole-business net sales, trained on 2021–2024 and scored against the held-back 2025 actuals. MAPE is mean absolute percentage error — lower is better."
        >
          <DataTable
            head={[
              'Candidate',
              <span key="m" className="inline-flex items-center gap-1">
                Monthly
                <InfoTip>Mean absolute percentage error across the 12 held-back months of 2025.</InfoTip>
              </span>,
              'Weekly',
            ]}
          >
            {CANDIDATES.map((c) => (
              <tr key={c.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-2.5 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{c.label}</span>
                    <Badge tone={c.tone}>{c.kind}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{c.oneLiner}</p>
                </td>
                <td className={`tabular-figure px-2.5 py-2 text-right text-sm font-bold ${errTone(c.monthly)}`}>
                  {c.monthly.toFixed(1)}%
                </td>
                <td className={`tabular-figure px-2.5 py-2 text-right text-sm font-bold ${errTone(c.weekly)}`}>
                  {c.weekly.toFixed(1)}%
                </td>
              </tr>
            ))}
          </DataTable>
          <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            Chronos-2 sweeps all 6 whole-business contests — 2 metrics × 3 grains.
          </p>
        </Card>

        <Card
          title="Champion wins, by grain"
          tip="Each of the 881 dimensional contests has exactly one winner. These are the counts of contests each model won outright."
        >
          <DataTable head={['Model', 'Monthly', 'Weekly', 'Yearly']}>
            {WINS.map((w) => (
              <tr key={w.label} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-2.5 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{w.label}</td>
                {([w.monthly, w.weekly, w.yearly] as const).map((v, k) => {
                  const isTop = v === [best.monthly, best.weekly, best.yearly][k]
                  return (
                    <td
                      key={k}
                      className={`tabular-figure px-2.5 py-2 text-right text-sm ${
                        isTop
                          ? 'font-extrabold text-primary-700 dark:text-primary-300'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {v}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Contests scored
              </td>
              <td className="tabular-figure px-2.5 py-2 text-right text-sm font-bold text-slate-800 dark:text-slate-200">
                {totals.monthly}
              </td>
              <td className="tabular-figure px-2.5 py-2 text-right text-sm font-bold text-slate-800 dark:text-slate-200">
                {totals.weekly}
              </td>
              <td className="tabular-figure px-2.5 py-2 text-right text-sm font-bold text-slate-800 dark:text-slate-200">
                {totals.yearly}
              </td>
            </tr>
          </DataTable>
        </Card>
      </div>

      <div className="mt-4 rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white px-5 py-4 dark:border-primary-800 dark:from-primary-950/40 dark:to-slate-900">
        <div className="flex flex-wrap items-center gap-2.5">
          <span aria-hidden className="text-lg">
            🎯
          </span>
          <p className="text-sm font-extrabold uppercase tracking-wide text-primary-700 dark:text-primary-300">
            The finding that shaped the design
          </p>
        </div>
        <ul className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {FINDING.map((f) => (
            <li key={f} className="flex gap-2 text-base leading-snug text-slate-700 dark:text-slate-300">
              <span aria-hidden className="mt-0.5 font-bold text-primary-500 dark:text-primary-400">
                →
              </span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="Full-year 2025, held back entirely" className="lg:col-span-2">
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
                  Actual net sales
                </span>
                <span className="tabular-figure text-sm font-bold text-slate-900 dark:text-slate-50">
                  {ACTUAL_2025.toLocaleString()}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-slate-400 dark:bg-slate-600" style={{ width: '100%' }} />
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-600 dark:text-primary-400">
                  Chronos-2 forecast
                </span>
                <span className="tabular-figure text-sm font-bold text-primary-700 dark:text-primary-300">
                  {PREDICTED_2025.toLocaleString()}
                </span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${predictedWidth}%` }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                />
              </div>
            </div>
          </div>
          <p className="mt-3 text-base leading-relaxed text-slate-600 dark:text-slate-400">
            Trained on 2021–2024 only — landed full-year 2025 within <b>1.2%</b>, a year the model
            never saw.
          </p>
        </Card>

        <Card title="Dataset shape">
          <DataTable head={['Dimension', 'Distinct values']}>
            {DIMENSIONS.map((d) => (
              <tr key={d.name} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-2.5 py-2 text-sm text-slate-700 dark:text-slate-300">{d.name}</td>
                <td className="tabular-figure px-2.5 py-2 text-right text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {d.values}
                </td>
              </tr>
            ))}
          </DataTable>
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
            <b>Customer</b> dimension excluded — 500 IDs, ~8 rows/month each. Too little signal to
            forecast honestly.
          </p>
        </Card>
      </div>
    </div>
  )
}
