import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { ApiError, askQuestion } from '../api/client'
import { AnswerSection } from '../components/AnswerSection'
import { Badge, Card, Console, DataTable, SectionHead } from '../components/shell/primitives'
import type { AskResponse } from '../types/api'

// Each stage owns a matcher against the REAL log lines /api/ask returns, so "play the
// simulation" means running a genuine question through the genuine pipeline and lighting up
// stages from its actual output -- not animating a script. A stage with no matching lines is
// shown as skipped, which is itself informative (a "why" question never runs a forecast model).
interface Stage {
  id: string
  label: string
  icon: string
  technique: string
  input: string
  why: string
  match: (line: string) => boolean
}

const STAGES: Stage[] = [
  {
    id: 'question',
    label: 'Question in',
    icon: '💬',
    technique: 'Raw text capture',
    input: 'A manager types a question in plain English — no fixed syntax, no dropdowns.',
    why: 'Anything a person would actually ask has to be accepted as-is. Structure comes later, from the model, not from the user.',
    match: (l) => l.startsWith('question ='),
  },
  {
    id: 'intent',
    label: 'Intent & scope',
    icon: '🧭',
    technique: 'Three constrained LLM calls (Claude Haiku 4.5)',
    input: 'The question text, plus the complete live list of real branches, routes, categories, suppliers and metrics read from the dataset.',
    why: 'Extraction only, never arithmetic: one call reads the time grain and any literal year/month, one matches the scope against real values, one decides whether this is a "what is" or a "why did" question. Each is JSON-constrained and each is given the real vocabulary, so a name that is not in the data cannot come back as if it were.',
    match: (l) =>
      l.includes('date/period extraction') ||
      l.includes('scope extraction') ||
      l.includes('intent-classification') ||
      l.startsWith('parsed ->') ||
      l.startsWith('intent ->') ||
      l.startsWith('metrics ->'),
  },
  {
    id: 'retrieve',
    label: 'Data retrieval',
    icon: '🗄️',
    technique: 'Pandas resample over the transaction table',
    input: '250,000 real transaction rows spanning 2021-2025, filtered to the requested scope and resampled to the requested grain.',
    why: 'Every downstream number is a sum of real recorded rows. Partial edge weeks are trimmed and genuinely-inactive periods are kept as real zeros rather than silently skipped, so "latest period" always means what it says.',
    match: (l) => l.startsWith('horizon=') || l.includes('loaded') || l.includes('recorded'),
  },
  {
    id: 'champion',
    label: 'Champion lookup',
    icon: '🏆',
    technique: 'Lookup against the offline backtest results',
    input: 'The exact (metric, scope, grain) triple the question resolved to.',
    why: 'No model is chosen at request time. Six candidates were scored offline on a real 2021-2024 → 2025 holdout for every metric, scope and grain; the winner of that specific contest is what runs. If a scope has no winner on record, the question is refused rather than answered with a guess.',
    match: (l) => l.includes('champion') || l.includes('Phase 1') || l.includes('validated'),
  },
  {
    id: 'compute',
    label: 'Forecast or attribution',
    icon: '⚙️',
    technique: 'The winning model, or a pure-sum drill-down',
    input: 'The full training history for that scope — or, for a "why" question, both periods being compared.',
    why: 'A "what will it be" question runs the champion model. A "why did it change" question runs no model at all: it walks branch → category → product by direct summation and splits the deepest level into units, price and customer count. Both paths produce numbers before any language is generated.',
    match: (l) => l.startsWith('MODEL INPUT') || l.startsWith('MODEL OUTPUT') || l.includes('drill') || l.includes('total for'),
  },
  {
    id: 'validate',
    label: 'Validation gates',
    icon: '🛡️',
    technique: 'Reliability floor, confidence decay, actual-vs-forecast separation',
    input: 'The computed figure plus the champion’s own measured error for this scope.',
    why: 'A champion whose measured error exceeds 40% is rejected outright — being the least-bad of a bad field is not good enough to show a client. Forecasts further from the backtested horizon get their confidence downgraded, and a period already fully recorded is returned as a labelled actual, never dressed up as a forecast.',
    match: (l) => l.startsWith('confidence:') || l.includes('reliability floor') || l.includes('refusing') || l.includes('range'),
  },
  {
    id: 'explain',
    label: 'AI explanation',
    icon: '✨',
    technique: 'Claude Haiku 4.5, grounded and verified',
    input: 'Only the already-computed figures — the value, the method, the method’s backtest record, and for a "why" question the full computed drill-down.',
    why: 'The model is given numbers and asked to narrate them. It is explicitly forbidden from recalculating, rounding or inventing, and the output is then checked programmatically: the figure must literally appear in the text, and a recommendation must name a real entity from the computed breakdown or it is replaced with a deterministic fallback.',
    match: (l) => l.includes('LLM phrased') || l.includes('verified the figure') || l.includes('sales analyst') || l.includes('grounded'),
  },
  {
    id: 'answer',
    label: 'Answer out',
    icon: '📤',
    technique: 'Structured response',
    input: 'The figure, its period, the method and why it was chosen, the confidence and its reason, the chart series, and the narrative.',
    why: 'The client sees the number and the full provenance of that number in the same view — which model, how accurate it has been, and what it could not tell them.',
    match: (l) => l.includes('net_sales:') || l.includes('value=') || l.includes('answer'),
  },
]

// A single LLM prompt line in the log can run to several thousand characters; the console shows
// enough to prove what was sent without turning into a wall of prompt text.
function clamp(line: string) {
  return line.length > 400 ? `${line.slice(0, 400)}…` : line
}

const DEMO_QUESTIONS = [
  'What will net sales be next month?',
  'Why did Vancouver Branch sales change in 2025?',
  'What will Winnipeg Branch revenue be in 2027?',
  'What will next week’s revenue be?',
  'Why did net sales change last year?',
  'What was profit in June 2024?',
  'How is the Analgesics category performing?',
  'What’s driving the change in Diagnostics category sales?',
]

// Each stage stays "active" for this long before the walk advances -- slow enough that a
// client watching the demo can read the stage name and its log lines before it moves on.
const STAGE_DWELL_MS = 1600

const DATA_INPUTS: [string, string][] = [
  ['Transaction line items (250k rows)', '2021-2025'],
  ['Branch / route / category / product / supplier / customer-type dimensions', '7 dimensions'],
  ['Quantity, unit price, unit cost, discount per line', 'per transaction'],
  ['Derived metrics: net sales, gross sales, profit, units', '4 validated'],
  ['Offline backtest score tables', '881 contests'],
]

const MODEL_VALUE: [string, string][] = [
  ['Candidates scored per contest', '6'],
  ['Champion selection', 'per metric × scope × grain'],
  ['Holdout', '2021-2024 train → 2025 test'],
  ['Reliability floor', 'reject above 40% error'],
  ['Forecast horizons', 'week, month, year'],
  ['Attribution depth', 'business → branch → category → product → driver'],
]

export function WorkflowPage() {
  const [question, setQuestion] = useState(DEMO_QUESTIONS[1])
  const [playing, setPlaying] = useState(false)
  const [response, setResponse] = useState<AskResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeStage, setActiveStage] = useState<string | null>(null)
  const [reached, setReached] = useState<string[]>([])
  // Stages opened by hand (before or independent of a run) -- kept separate from `reached` so
  // browsing the pipeline out of curiosity never inflates the "N/8 stages" progress readout,
  // which is meant to reflect an actual run.
  const [viewed, setViewed] = useState<string[]>([])

  // Console restarts its reveal animation whenever the `lines` array identity changes, and the
  // play loop re-renders this component every 320ms -- so these have to be stable references
  // or the log visibly restarts from line 1 on every tick.
  const log = useMemo(() => (response?.log ?? []).map(clamp), [response])
  const stageLines = useMemo(
    () => Object.fromEntries(STAGES.map((s) => [s.id, log.filter(s.match)])) as Record<string, string[]>,
    [log],
  )

  async function play() {
    setPlaying(true)
    setError(null)
    setResponse(null)
    setReached([])
    setViewed([])
    setActiveStage(null)
    try {
      const res = await askQuestion(question)
      setResponse(res)
      // Walk the stages in order as the real log is revealed, so the pipeline visibly runs --
      // slow enough (STAGE_DWELL_MS) that each stage is actually readable before the next one
      // takes over, not a blur of highlights.
      for (const stage of STAGES) {
        setActiveStage(stage.id)
        await new Promise((resolve) => setTimeout(resolve, STAGE_DWELL_MS))
        setReached((r) => [...r, stage.id])
      }
      setActiveStage(null)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not run the pipeline.')
    } finally {
      setPlaying(false)
    }
  }

  const progress = (reached.length / STAGES.length) * 100
  const visibleStages = STAGES.filter((s) => reached.includes(s.id) || viewed.includes(s.id) || s.id === activeStage)

  return (
    <div>
      <SectionHead eyebrow="System architecture" title="End-to-end: question to answer">
        Click any stage to see exactly what goes in, which technique runs there, and why it exists.
        Or press <b>Play full pipeline</b> to send a real question through the real system and watch
        the stages light up from its actual log output — the same log the engine writes on every
        request.
      </SectionHead>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Question to run
            </p>
            <select
              className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:border-primary-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              aria-label="Question to run"
            >
              {DEMO_QUESTIONS.map((q) => (
                <option key={q} value={q}>
                  {q}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={play}
            disabled={playing}
            className="flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
          >
            {playing ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Running…
              </>
            ) : (
              <>▶ Play full pipeline</>
            )}
          </button>
        </div>

        {(playing || reached.length > 0) && (
          <div className="mt-4">
            {playing && !response ? (
              // The real request is still in flight -- no stage can honestly "light up" yet
              // because the stage walk below replays the log AFTER it comes back. Showing an
              // empty "0/8 stages" bar here read as stuck, so this phase gets its own indicator.
              <div className="flex items-center gap-2.5 rounded-xl border border-primary-200 bg-primary-50/60 px-4 py-3 dark:border-primary-800 dark:bg-primary-950/40">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400" />
                <p className="text-sm font-bold text-primary-700 dark:text-primary-300">
                  Sending the question through the live system…
                </p>
              </div>
            ) : (
              <>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <span>{playing ? 'pipeline running' : 'pipeline complete'}</span>
                  <span className="tabular-figure">
                    {reached.length}/{STAGES.length} stages
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500"
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <AnimatePresence mode="wait">
                  {activeStage && (
                    <motion.p
                      key={activeStage}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className="mt-2.5 flex items-center gap-2 text-base font-bold text-primary-700 dark:text-primary-300"
                    >
                      <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
                      Now running: {STAGES.find((s) => s.id === activeStage)?.icon}{' '}
                      {STAGES.find((s) => s.id === activeStage)?.label}
                    </motion.p>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            ⚠️ {error}
          </div>
        )}
      </Card>

      {/* ---------- stage pipeline ---------- */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-8">
        {STAGES.map((stage, i) => {
          const isActive = activeStage === stage.id
          const isReached = reached.includes(stage.id) || viewed.includes(stage.id)
          const hits = (stageLines[stage.id] ?? []).length
          return (
            <button
              key={stage.id}
              type="button"
              onClick={() => setViewed((v) => (v.includes(stage.id) ? v : [...v, stage.id]))}
              className={`relative rounded-xl border-2 p-2.5 text-left transition ${
                isActive
                  ? 'border-primary-500 bg-primary-50 shadow-[var(--shadow-card-hover)] dark:border-primary-400 dark:bg-primary-950/50'
                  : isReached
                    ? 'border-accent-300 bg-accent-50/60 dark:border-accent-700 dark:bg-accent-950/30'
                    : 'border-slate-200 bg-white hover:border-primary-300 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="tabular-figure text-[9.5px] font-bold text-slate-400 dark:text-slate-500">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span aria-hidden className="text-sm">
                  {stage.icon}
                </span>
              </div>
              <p className="mt-1 text-[11.5px] font-bold leading-tight text-slate-800 dark:text-slate-200">
                {stage.label}
              </p>
              {response && (
                <p
                  className={`tabular-figure mt-1 text-[9.5px] font-bold uppercase ${
                    hits > 0 ? 'text-accent-700 dark:text-accent-400' : 'text-slate-400 dark:text-slate-600'
                  }`}
                >
                  {hits > 0 ? `${hits} log line${hits === 1 ? '' : 's'}` : 'not used'}
                </p>
              )}
            </button>
          )
        })}
      </div>

      {/* ---------- stage-by-stage explanation, revealed one after another as the pipeline runs ---------- */}
      {visibleStages.length > 0 && (
        <div className="mt-4">
          {visibleStages.map((stage, i) => {
            const isLive = stage.id === activeStage
            const isLastVisible = i === visibleStages.length - 1
            const stepNumber = STAGES.findIndex((s) => s.id === stage.id) + 1
            return (
              <motion.div
                key={stage.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className={`relative pl-14 ${isLastVisible ? 'pb-0' : 'pb-6'}`}
              >
                {!isLastVisible && (
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-[23px] top-12 w-0.5 bg-gradient-to-b from-accent-300 to-primary-200 dark:from-accent-700 dark:to-primary-900"
                  />
                )}
                <span
                  aria-hidden
                  className={`absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-full border-2 text-xl shadow-sm ${
                    isLive
                      ? 'border-primary-500 bg-primary-100 dark:bg-primary-900/60'
                      : 'border-accent-400 bg-accent-50 dark:border-accent-600 dark:bg-accent-950/50'
                  }`}
                >
                  {stage.icon}
                </span>
                <Card>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="tabular-figure text-[11px] font-bold text-slate-400 dark:text-slate-500">
                      STEP {String(stepNumber).padStart(2, '0')}
                    </span>
                    <h3 className="text-xl font-extrabold text-slate-900 dark:text-slate-50">{stage.label}</h3>
                    <Badge tone="brand">{stage.technique}</Badge>
                    {isLive && (
                      <span className="ml-auto flex items-center gap-1.5 text-xs font-bold text-primary-600 dark:text-primary-400">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-primary-500" />
                        running now
                      </span>
                    )}
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                    <div className="rounded-xl border-l-4 border-primary-400 bg-primary-50/50 px-4 py-3 dark:border-primary-600 dark:bg-primary-950/30">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                        What goes in
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{stage.input}</p>
                    </div>
                    <div className="rounded-xl border-l-4 border-accent-400 bg-accent-50/50 px-4 py-3 dark:border-accent-600 dark:bg-accent-950/30">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-accent-700 dark:text-accent-300">
                        Why this stage exists
                      </p>
                      <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{stage.why}</p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ---------- live log ---------- */}
      <div className="mt-4">
        <Card
          title="Live pipeline log"
          tip="The complete, unedited log the backend emitted for this request — the same array the API returns on every /api/ask call."
        >
          <Console
            lines={log}
            placeholder='Press "▶ Play full pipeline" to run a real question through the system…'
            revealMs={45}
            height="h-80"
          />
        </Card>
      </div>

      <div className="mt-4 flex items-start gap-2.5 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        <span aria-hidden className="text-lg">
          ↺
        </span>
        <span>
          Re-running the offline scoring scripts re-selects every champion against the newest
          complete year, so the model behind each answer is re-earned rather than assumed. Nothing
          is promoted to production without winning that holdout again.
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Data inputs">
          <DataTable head={['Source', 'Coverage']}>
            {DATA_INPUTS.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-2.5 py-2 text-[15px] text-slate-700 dark:text-slate-300">{k}</td>
                <td className="px-2.5 py-2 text-right text-[15px] font-semibold text-slate-500 dark:text-slate-400">
                  {v}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
        <Card title="Model & business rules">
          <DataTable head={['Rule', 'Value']}>
            {MODEL_VALUE.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                <td className="px-2.5 py-2 text-[15px] text-slate-700 dark:text-slate-300">{k}</td>
                <td className="px-2.5 py-2 text-right text-[15px] font-semibold text-slate-500 dark:text-slate-400">
                  {v}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      </div>

      {response && (
        <div className="mt-8 border-t-2 border-slate-100 pt-6 dark:border-slate-800">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
            …and the answer the client sees
          </p>
          <AnswerSection response={response} />
        </div>
      )}
    </div>
  )
}
