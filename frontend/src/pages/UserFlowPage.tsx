import { motion } from 'framer-motion'
import { Badge, Card, DataTable, InfoTip, SectionHead, Stat } from '../components/shell/primitives'

type Tone = 'good' | 'warn' | 'bad' | 'brand' | 'accent' | 'muted'

interface Stage {
  n: string
  icon: string
  label: string
  technique: string
  goesIn: string[]
  comesOut: string[]
  chips?: string[]
  paths?: { label: string; tone: Tone; points: string[] }[]
}

const STAGES: Stage[] = [
  {
    n: '01',
    icon: '💬',
    label: 'Question in',
    technique: 'Raw text capture',
    goesIn: ['Plain English', 'No dropdowns or fixed syntax'],
    comesOut: ['Raw string, unmodified', 'Structure comes later'],
    chips: ['plain English', 'no query syntax'],
  },
  {
    n: '02',
    icon: '🧭',
    label: 'Intent & scope',
    technique: '3 constrained Claude Haiku 4.5 calls',
    goesIn: ['The question text', 'Live vocabulary — real branches, routes, categories, suppliers'],
    comesOut: ['Time grain + literal year/month', 'Scope matched to real values', '“what” vs “why” classified'],
    chips: ['time grain + literal year/month', 'scope matched to real values', '“what is” vs “why did”'],
  },
  {
    n: '03',
    icon: '🗄️',
    label: 'Data retrieval',
    technique: 'pandas resample over the transaction table',
    goesIn: ['250,000-row transaction table', 'Filtered to scope + grain'],
    comesOut: ['Real series, summed rows only', 'No interpolation, no model output'],
    chips: ['week', 'month', 'year'],
  },
  {
    n: '04',
    icon: '🏆',
    label: 'Champion lookup',
    technique: 'Lookup against the offline backtest results',
    goesIn: ['The exact (metric, scope, grain) triple'],
    comesOut: ['The one model that won that contest', 'Or an honest refusal — no winner on record'],
    chips: ['881 contests on file', 'nothing chosen at request time'],
  },
  {
    n: '05',
    icon: '⚙️',
    label: 'Forecast or attribution',
    technique: 'The winning model, or a pure-summation drill-down',
    goesIn: ['Training history for that scope', 'Or, for “why”, both periods being compared'],
    comesOut: ['A number — before any language is generated'],
    paths: [
      {
        label: '“What will it be?”',
        tone: 'brand',
        points: [
          'The pre-selected champion runs — nothing chosen live',
          'Trains on the full validated history for that scope',
          'Chronos-2 also returns real 80% quantile bounds; the 4 statistical baselines return a point estimate only',
          'Raw output is a plain number, unrounded',
          'A fully recorded period skips the model — returns the real summed actual instead',
        ],
      },
      {
        label: '“Why did it change?”',
        tone: 'accent',
        points: [
          'No model runs at all',
          'Walks business → branch → category → product by direct summation',
          'Deepest level splits into units, price, customer count',
        ],
      },
    ],
  },
  {
    n: '06',
    icon: '🛡️',
    label: 'Validation gates',
    technique: 'Reliability floor, confidence decay, actual/forecast separation',
    goesIn: ['The computed figure', 'The champion’s own measured error for this scope'],
    comesOut: ['Figure + confidence + reason', 'Or a refusal — least-bad isn’t good enough'],
    chips: ['40% error floor', 'confidence decays with horizon', 'actuals labelled as actuals'],
  },
  {
    n: '07',
    icon: '✨',
    label: 'AI explanation',
    technique: 'Claude Haiku 4.5, grounded and verified',
    goesIn: ['Only already-computed figures', 'Value, method, backtest record', 'Full drill-down for a “why”'],
    comesOut: ['Short narrative, programmatically checked', 'Figure must appear in text', 'Real entity or fallback'],
    chips: ['no recalculation', 'figure verified in text', 'real entity or fallback'],
  },
]

const SHAPE: { label: string; value: string; sub: string }[] = [
  { label: 'Stages', value: '7', sub: 'question in → answer out' },
  { label: 'LLM calls before any number', value: '3', sub: 'extraction only, JSON-constrained' },
  { label: 'Models run per forecast', value: '1', sub: 'the pre-selected champion' },
  { label: 'Models run for a “why”', value: '0', sub: 'pure summation, end to end' },
]

const PROVENANCE: string[] = [
  'The figure and its exact period',
  'Which model, and why it was chosen',
  'That model’s measured error, this scope',
  'A confidence level with its reason',
  'The full history series behind the chart',
  'A grounded narrative + named recommendation',
]

const EXAMPLES: { q: string; models: string; path: string; tone: Tone }[] = [
  {
    q: 'What will net sales be next month?',
    models: '1',
    path: 'Champion forecast',
    tone: 'brand',
  },
  {
    q: 'Why did Vancouver Branch sales change in 2025?',
    models: '0',
    path: 'Attribution drill-down',
    tone: 'accent',
  },
  {
    q: 'What was profit in June 2024?',
    models: '0',
    path: 'Recorded actual',
    tone: 'good',
  },
  {
    q: 'What will Winnipeg Branch revenue be in 2027?',
    models: '1',
    path: 'Forecast, confidence decayed',
    tone: 'warn',
  },
]

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="mt-1.5 space-y-1">
      {items.map((it) => (
        <li key={it} className="flex gap-1.5 text-[15px] font-medium leading-snug text-slate-700 dark:text-slate-300">
          <span aria-hidden className="text-slate-400 dark:text-slate-600">
            ·
          </span>
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

export function UserFlowPage() {
  return (
    <div>
      <SectionHead eyebrow="User flow" title="How a question becomes an answer">
        One question, seven stages, one answer — three of those stages exist only to refuse it
        honestly when the data can't support one.
      </SectionHead>

      <Card>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {SHAPE.map((s, i) => (
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

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {STAGES.map((s, i) => (
          <motion.div
            key={s.n}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: i * 0.05 }}
            className="rounded-xl border-2 border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="flex items-center justify-between">
              <span className="tabular-figure text-[10px] font-bold text-slate-400 dark:text-slate-500">{s.n}</span>
              <span aria-hidden className="text-sm">
                {s.icon}
              </span>
            </div>
            <p className="mt-1 text-sm font-bold leading-tight text-slate-800 dark:text-slate-200">{s.label}</p>
          </motion.div>
        ))}
      </div>

      <ol className="mt-6 space-y-3">
        {STAGES.map((s, i) => (
          <motion.li
            key={s.n}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
            className="flex gap-4"
          >
            <div className="flex flex-col items-center">
              <div className="z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-primary-300 bg-white text-lg shadow-[var(--shadow-card)] dark:border-primary-700 dark:bg-slate-900">
                <span aria-hidden>{s.icon}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className="w-0.5 flex-1 bg-gradient-to-b from-primary-300 to-accent-300 dark:from-primary-700 dark:to-accent-800" />
              )}
            </div>

            <div className="min-w-0 flex-1 pb-2">
              <Card>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="tabular-figure text-[11px] font-bold text-slate-400 dark:text-slate-500">{s.n}</span>
                  <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                    {s.label}
                  </h3>
                  <Badge tone="brand">{s.technique}</Badge>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border-l-4 border-primary-400 bg-primary-50/50 px-4 py-3 dark:border-primary-600 dark:bg-primary-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-700 dark:text-primary-300">
                      Goes in
                    </p>
                    <BulletList items={s.goesIn} />
                  </div>
                  <div className="rounded-xl border-l-4 border-accent-400 bg-accent-50/50 px-4 py-3 dark:border-accent-600 dark:bg-accent-950/30">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent-700 dark:text-accent-300">
                      Comes out
                    </p>
                    <BulletList items={s.comesOut} />
                  </div>
                </div>

                {s.chips && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.chips.map((c) => (
                      <span
                        key={c}
                        className="tabular-figure rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {s.paths && (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {s.paths.map((p) => (
                      <div
                        key={p.label}
                        className="rounded-xl border-2 border-dashed border-slate-300 px-4 py-3 dark:border-slate-700"
                      >
                        <Badge tone={p.tone}>{p.label}</Badge>
                        <BulletList items={p.points} />
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </motion.li>
        ))}
      </ol>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: STAGES.length * 0.05 }}
        className="mt-3 rounded-2xl border-2 border-primary-300 bg-gradient-to-br from-primary-50 to-accent-50/40 p-5 dark:border-primary-700 dark:from-primary-950/50 dark:to-accent-950/20"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span aria-hidden className="text-xl">
            📤
          </span>
          <h3 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            The answer, with its provenance attached
          </h3>
          <Badge tone="good">single response</Badge>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          {PROVENANCE.map((p) => (
            <div key={p} className="flex gap-2.5 text-[15px] font-medium leading-snug text-slate-700 dark:text-slate-300">
              <span aria-hidden className="mt-0.5 font-bold text-accent-600 dark:text-accent-400">
                ✓
              </span>
              <span>{p}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card
          title="Four questions, four different paths"
          tip="The same input box handles all of these. What differs is how many models run — and for two of them, the answer is none at all."
        >
          <DataTable
            head={[
              'Question typed',
              <span key="m" className="inline-flex items-center gap-1">
                Models run
                <InfoTip>
                  A forecast runs exactly one model: the champion for that scope and grain. A “why”
                  question and a historical lookup run none — both are pure summation over recorded
                  rows.
                </InfoTip>
              </span>,
              'Path taken',
            ]}
          >
            {EXAMPLES.map((e) => (
              <tr key={e.q} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-2.5 py-2 text-[15px] text-slate-700 dark:text-slate-300">{e.q}</td>
                <td className="tabular-figure px-2.5 py-2 text-right text-[15px] font-bold text-slate-800 dark:text-slate-200">
                  {e.models}
                </td>
                <td className="px-2.5 py-2 text-right">
                  <Badge tone={e.tone}>{e.path}</Badge>
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>

        <Card title="Where the flow stops instead of answering">
          <ul className="space-y-2.5">
            <li className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
              <span aria-hidden className="mt-0.5 font-bold text-amber-500 dark:text-amber-400">
                ⛔
              </span>
              <span>
                <b>No champion on record</b> — refused, never chosen on the spot.
              </span>
            </li>
            <li className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
              <span aria-hidden className="mt-0.5 font-bold text-amber-500 dark:text-amber-400">
                ⛔
              </span>
              <span>
                <b>Above the 40% floor</b> — 33 monthly + 175 weekly scopes return nothing.
              </span>
            </li>
            <li className="flex gap-2.5 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
              <span aria-hidden className="mt-0.5 font-bold text-amber-500 dark:text-amber-400">
                ⛔
              </span>
              <span>
                <b>Too little data</b> — needs 12+ test months or 52+ test weeks; customer dimension excluded entirely.
              </span>
            </li>
          </ul>
          <p className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-sm leading-relaxed font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            A refusal is a designed outcome, not a failure — the alternative is a number with no
            evidence behind it.
          </p>
        </Card>
      </div>
    </div>
  )
}
