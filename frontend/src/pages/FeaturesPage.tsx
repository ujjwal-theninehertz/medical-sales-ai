import { motion } from 'framer-motion'
import { Badge, Card, DataTable, InfoTip, SectionHead, Stat } from '../components/shell/primitives'

type Tone = 'good' | 'warn' | 'bad' | 'brand' | 'accent' | 'muted'

const GRAINS = ['monthly', 'weekly', 'yearly'] as const
type Grain = (typeof GRAINS)[number]

interface FeatureGroup {
  n: string
  icon: string
  title: string
  badge: string
  tone: Tone
  items: string[]
  chips?: string[]
}

const SHIPPED: { label: string; value: string; sub: string }[] = [
  { label: 'Forecast grains', value: '3', sub: 'weekly · monthly · yearly' },
  { label: 'Validated champions', value: '881', sub: '302 monthly · 277 weekly · 302 yearly' },
  { label: 'Scopes answerable', value: '8', sub: 'whole business + 7 dimensions' },
  { label: 'Automated regression checks', value: '124', sub: '74 value + 50 attribution' },
]

const GROUPS: FeatureGroup[] = [
  {
    n: '01',
    icon: '💬',
    title: 'Ask in plain English',
    badge: 'no query syntax',
    tone: 'brand',
    items: [
      'No syntax, dropdowns, or fields to learn',
      '3 LLM calls extract grain, scope, intent',
      'Past periods labeled as actuals, not forecasts',
    ],
    chips: ['3 extraction calls', 'actuals stay actuals'],
  },
  {
    n: '02',
    icon: '🔮',
    title: 'Forecast at every grain and scope',
    badge: '3 grains × 8 scopes',
    tone: 'accent',
    items: [
      'Weekly, monthly, yearly — same 250K rows',
      '8 scopes: business + 7 dimensions',
      '881 contests, 6 models each → 881 champions',
    ],
    chips: ['881 contests', '6 candidates each'],
  },
  {
    n: '03',
    icon: '🏆',
    title: 'Champion transparency',
    badge: 'provenance attached',
    tone: 'brand',
    items: [
      'Which model answered',
      'Why it was chosen — metric × scope × grain',
      'Its measured backtest error, not a headline claim',
    ],
  },
  {
    n: '04',
    icon: '🔍',
    title: 'Growth and decline attribution',
    badge: 'fully symmetric',
    tone: 'accent',
    items: [
      'Same machinery for rises and falls',
      'Drills business → branch → category → product',
      'Zero LLM arithmetic — pure row sums',
    ],
    chips: ['0 models run', 'no LLM arithmetic'],
  },
  {
    n: '05',
    icon: '✨',
    title: 'Grounded AI narration',
    badge: 'verified in text',
    tone: 'good',
    items: [
      'Describes numbers only — never recalculates',
      'Figure must appear in text, or it’s rejected',
      'Recommendations name real entities, or fall back',
    ],
  },
  {
    n: '06',
    icon: '🛡️',
    title: 'Confidence and reliability gates',
    badge: '40% error floor',
    tone: 'warn',
    items: [
      'Error over 40% = refused, not shown',
      'Confidence fades with distance from horizon',
      'Every refusal states a specific reason',
    ],
  },
  {
    n: '07',
    icon: '🧪',
    title: 'Live model comparison lab',
    badge: 'inspect it live',
    tone: 'brand',
    items: [
      '5 candidates, side by side, any scope',
      'Real per-model logs, live',
      'Predictions and errors, compared in one view',
    ],
    chips: ['real logs', 'side-by-side errors'],
  },
  {
    n: '08',
    icon: '📊',
    title: 'Status matrix and interface',
    badge: 'every scope at a glance',
    tone: 'muted',
    items: [
      'Every value, every grain, period-over-period change',
      'Flags which scopes have a validated model',
      'Light/dark, laptop to boardroom display',
    ],
  },
]

const COVERAGE: { grain: string; champions: number; note: string }[] = [
  { grain: 'Monthly', champions: 302, note: 'per metric × scope' },
  { grain: 'Weekly', champions: 277, note: 'thin scopes never entered' },
  { grain: 'Yearly', champions: 302, note: 'per metric × scope' },
]

const CANDIDATES_PER_CONTEST = 6

const WIN_MIX: { label: string; bar: string; dot: string; wins: Record<Grain, number> }[] = [
  {
    label: 'Chronos-2',
    bar: 'bg-primary-500 dark:bg-primary-400',
    dot: 'bg-primary-500 dark:bg-primary-400',
    wins: { monthly: 103, weekly: 173, yearly: 59 },
  },
  {
    label: 'Claude Haiku 4.5',
    bar: 'bg-accent-500 dark:bg-accent-400',
    dot: 'bg-accent-500 dark:bg-accent-400',
    wins: { monthly: 83, weekly: 14, yearly: 62 },
  },
  {
    label: 'Seasonal naive',
    bar: 'bg-blue-500 dark:bg-blue-400',
    dot: 'bg-blue-500 dark:bg-blue-400',
    wins: { monthly: 52, weekly: 3, yearly: 57 },
  },
  {
    label: 'Linear trend',
    bar: 'bg-emerald-500 dark:bg-emerald-400',
    dot: 'bg-emerald-500 dark:bg-emerald-400',
    wins: { monthly: 28, weekly: 15, yearly: 76 },
  },
  {
    label: 'Moving average',
    bar: 'bg-amber-500 dark:bg-amber-400',
    dot: 'bg-amber-500 dark:bg-amber-400',
    wins: { monthly: 20, weekly: 15, yearly: 37 },
  },
  {
    label: 'Naive (last value)',
    bar: 'bg-slate-400 dark:bg-slate-500',
    dot: 'bg-slate-400 dark:bg-slate-500',
    wins: { monthly: 16, weekly: 57, yearly: 11 },
  },
]

const DRILL: { label: string; sub: string }[] = [
  { label: 'Whole business', sub: 'the movement to explain' },
  { label: 'Branch', sub: '15 values' },
  { label: 'Category', sub: '15 values' },
  { label: 'Product', sub: '200 values' },
]

const DRIVERS: { icon: string; label: string; body: string }[] = [
  { icon: '📦', label: 'Units sold', body: 'Volume at the deepest level' },
  { icon: '🏷️', label: 'Average price', body: 'Price per unit, over the period' },
  { icon: '👥', label: 'Distinct customers', body: 'Distinct buyers contributing' },
]

const TESTS: { suite: string; checks: number; covers: string }[] = [
  { suite: 'Forecast & value scenarios', checks: 74, covers: 'forecasts, historical actuals, refusals' },
  { suite: 'Attribution scenarios', checks: 50, covers: 'growth and decline drill-downs' },
]

const ACTUAL_2025 = 37_192_817

export function FeaturesPage() {
  const grainTotals = GRAINS.reduce<Record<Grain, number>>(
    (acc, g) => {
      acc[g] = WIN_MIX.reduce((sum, m) => sum + m.wins[g], 0)
      return acc
    },
    { monthly: 0, weekly: 0, yearly: 0 },
  )
  const totalChampions = COVERAGE.reduce((sum, c) => sum + c.champions, 0)
  const totalChecks = TESTS.reduce((sum, t) => sum + t.checks, 0)

  return (
    <div>
      <SectionHead eyebrow="Features delivered" title="Everything the platform actually does">
        8 capability groups — from a plain-English question box to a live model-comparison lab.
        Every accuracy figure is measured on a real 2021–2024 → 2025 holdout. Refusing to answer
        is a shipped feature too.
      </SectionHead>

      <Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SHIPPED.map((s, i) => (
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

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {GROUPS.map((g, i) => (
          <motion.div
            key={g.n}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.04 }}
            className="rounded-xl border-2 border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="tabular-figure text-[10px] font-bold text-slate-400 dark:text-slate-500">{g.n}</span>
              <span aria-hidden className="text-sm">
                {g.icon}
              </span>
            </div>
            <p className="mt-1 text-xs font-bold leading-tight text-slate-800 dark:text-slate-200">{g.title}</p>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {GROUPS.map((g, i) => (
          <motion.div
            key={g.n}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, delay: (i % 2) * 0.05 }}
          >
            <Card className="h-full">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-primary-300 bg-primary-50 text-base dark:border-primary-700 dark:bg-primary-950/40">
                  <span aria-hidden>{g.icon}</span>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular-figure text-xs font-bold text-slate-400 dark:text-slate-500">
                      {g.n}
                    </span>
                    <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                      {g.title}
                    </h3>
                    <Badge tone={g.tone}>{g.badge}</Badge>
                  </div>
                </div>
              </div>

              <ul className="mt-3 space-y-2">
                {g.items.map((item) => (
                  <li
                    key={item}
                    className="flex gap-2.5 text-base leading-relaxed text-slate-700 dark:text-slate-300"
                  >
                    <span aria-hidden className="mt-0.5 font-bold text-emerald-500 dark:text-emerald-400">
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {g.chips && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {g.chips.map((c) => (
                    <span
                      key={c}
                      className="tabular-figure rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Validated coverage, by grain"
          tip="A champion exists only where a contest was actually scored. Scopes with too little history never entered one, and no model is picked at request time."
        >
          <DataTable
            head={[
              'Grain',
              <span key="c" className="inline-flex items-center gap-1">
                Champions on file
                <InfoTip>
                  One winner per metric × scope × grain, decided offline against the held-back 2025
                  actuals.
                </InfoTip>
              </span>,
              'Candidate fits scored',
            ]}
          >
            {COVERAGE.map((c) => (
              <tr key={c.grain} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-2.5 py-2">
                  <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{c.grain}</span>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{c.note}</p>
                </td>
                <td className="tabular-figure px-2.5 py-2 text-right text-sm font-bold text-slate-800 dark:text-slate-200">
                  {c.champions}
                </td>
                <td className="tabular-figure px-2.5 py-2 text-right text-sm text-slate-500 dark:text-slate-400">
                  {(c.champions * CANDIDATES_PER_CONTEST).toLocaleString()}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Total
              </td>
              <td className="tabular-figure px-2.5 py-2 text-right text-sm font-extrabold text-primary-700 dark:text-primary-300">
                {totalChampions}
              </td>
              <td className="tabular-figure px-2.5 py-2 text-right text-sm font-bold text-slate-800 dark:text-slate-200">
                {(totalChampions * CANDIDATES_PER_CONTEST).toLocaleString()}
              </td>
            </tr>
          </DataTable>
        </Card>

        <Card
          title="Which model answered — and how often"
          tip="Champion wins as a share of the contests scored at each grain. The mix changes completely between grains, which is why a champion is stored per contest rather than chosen globally."
        >
          <div className="space-y-3">
            {GRAINS.map((g) => (
              <div key={g}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
                    {g}
                  </span>
                  <span className="tabular-figure text-xs font-bold text-slate-700 dark:text-slate-300">
                    {grainTotals[g]} champions
                  </span>
                </div>
                <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  {WIN_MIX.map((m, i) => (
                    <motion.div
                      key={m.label}
                      className={m.bar}
                      initial={{ width: 0 }}
                      animate={{ width: `${(m.wins[g] / grainTotals[g]) * 100}%` }}
                      transition={{ duration: 0.5, delay: 0.05 * i }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {WIN_MIX.map((m) => (
              <div key={m.label} className="flex items-center gap-1.5">
                <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-sm ${m.dot}`} />
                <span className="truncate text-xs font-semibold text-slate-600 dark:text-slate-400">
                  {m.label}
                </span>
              </div>
            ))}
          </div>

          <ul className="mt-3 space-y-1">
            <li className="flex gap-2 text-base leading-snug text-slate-600 dark:text-slate-400">
              <span aria-hidden className="mt-0.5 font-bold text-primary-500 dark:text-primary-400">
                →
              </span>
              <span>Chronos-2 — 173/277 weekly, only 59/302 yearly</span>
            </li>
            <li className="flex gap-2 text-base leading-snug text-slate-600 dark:text-slate-400">
              <span aria-hidden className="mt-0.5 font-bold text-primary-500 dark:text-primary-400">
                →
              </span>
              <span>Linear trend leads yearly — 76/302</span>
            </li>
            <li className="flex gap-2 text-base leading-snug text-slate-600 dark:text-slate-400">
              <span aria-hidden className="mt-0.5 font-bold text-primary-500 dark:text-primary-400">
                →
              </span>
              <span>Naive baseline still wins 57 weekly</span>
            </li>
          </ul>
        </Card>
      </div>

      <div className="mt-4 rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white px-5 py-4 dark:border-primary-800 dark:from-primary-950/40 dark:to-slate-900">
        <div className="flex flex-wrap items-center gap-2.5">
          <span aria-hidden className="text-lg">
            🎯
          </span>
          <p className="text-sm font-extrabold uppercase tracking-wide text-primary-700 dark:text-primary-300">
            What the accuracy actually measured
          </p>
          <Badge tone="good">held-back year</Badge>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat
            label="Whole-business monthly net sales"
            value="2.9%"
            sub="MAPE — Chronos-2, 12 held-back months"
            tone="text-emerald-600 dark:text-emerald-400"
          />
          <Stat
            label="Full-year 2025 net sales"
            value="+1.2%"
            sub={`against the recorded ${ACTUAL_2025.toLocaleString()}`}
            tone="text-emerald-600 dark:text-emerald-400"
          />
          <Stat label="Rows behind every figure" value="250,000" sub="Jan 2021 → Dec 2025, real transactions" />
        </div>
        <p className="mt-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
          Both trained on 2021–2024 only — neither saw the year it was scored against.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title="How an attribution answer is built" className="lg:col-span-2">
          <div className="flex flex-wrap items-stretch gap-2">
            {DRILL.map((d, i) => (
              <div key={d.label} className="flex items-center gap-2">
                <div className="rounded-xl border-2 border-primary-300 bg-primary-50/60 px-3 py-2 dark:border-primary-700 dark:bg-primary-950/30">
                  <p className="text-sm font-extrabold text-primary-800 dark:text-primary-200">{d.label}</p>
                  <p className="tabular-figure mt-0.5 text-xs font-medium text-primary-600 dark:text-primary-400">
                    {d.sub}
                  </p>
                </div>
                <span aria-hidden className="text-base font-bold text-slate-400 dark:text-slate-500">
                  {i < DRILL.length - 1 ? '→' : '⇢'}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {DRIVERS.map((d) => (
              <div
                key={d.label}
                className="rounded-xl border-2 border-dashed border-accent-300 bg-accent-50/40 px-3 py-2.5 dark:border-accent-700 dark:bg-accent-950/20"
              >
                <div className="flex items-center gap-1.5">
                  <span aria-hidden className="text-sm">
                    {d.icon}
                  </span>
                  <p className="text-sm font-extrabold text-accent-800 dark:text-accent-200">{d.label}</p>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{d.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl border-l-4 border-emerald-400 bg-emerald-50/60 px-4 py-2.5 dark:border-emerald-600 dark:bg-emerald-950/30">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-700 dark:text-emerald-300">
                Why did it grow?
              </p>
              <p className="mt-1 text-base leading-relaxed text-slate-700 dark:text-slate-300">
                Chain walked → contributors ranked → top products named.
              </p>
            </div>
            <div className="rounded-xl border-l-4 border-red-400 bg-red-50/60 px-4 py-2.5 dark:border-red-600 dark:bg-red-950/30">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-red-700 dark:text-red-300">
                Why did it fall?
              </p>
              <p className="mt-1 text-base leading-relaxed text-slate-700 dark:text-slate-300">
                Same machinery, opposite sign — decline is first-class.
              </p>
            </div>
          </div>
        </Card>

        <Card title="Automated regression checks" tip="Scenario checks that exercise the answer paths end to end, including the refusal paths.">
          <DataTable head={['Suite', 'Checks']}>
            {TESTS.map((t) => (
              <tr key={t.suite} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-2.5 py-2">
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t.suite}</span>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{t.covers}</p>
                </td>
                <td className="tabular-figure px-2.5 py-2 text-right text-sm font-bold text-slate-800 dark:text-slate-200">
                  {t.checks}
                </td>
              </tr>
            ))}
            <tr className="border-t-2 border-slate-200 dark:border-slate-700">
              <td className="px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Total
              </td>
              <td className="tabular-figure px-2.5 py-2 text-right text-sm font-extrabold text-primary-700 dark:text-primary-300">
                {totalChecks}
              </td>
            </tr>
          </DataTable>
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm leading-relaxed font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Attribution covers both directions — growth and decline alike.
          </p>
        </Card>
      </div>
    </div>
  )
}
