import { Fragment } from 'react'
import { motion } from 'framer-motion'

// The presentation's second stop -- between "here's the data" (page 1) and "here's how the
// models work" (page 3, the technical deep-dive). Deliberately light on text: a client-facing
// pitch page, not documentation. Every claim here is something the rest of the app actually
// does (decompose = explain_decline's branch->category->product tree, predict = the 302-scope
// champion system) -- nothing on this page is aspirational copy.

const PROCESS_STEPS = ['Understand', 'Predict', 'Investigate', 'Prioritize', 'Act']

const QUESTIONS = [
  {
    icon: '📊',
    category: 'Performance & Root Cause',
    question: 'What happened to our sales, and what were the key drivers behind the change?',
    cannot: 'Days of spreadsheet work, manually cross-referencing branches to find what moved.',
    can: 'The exact branch, category and product behind any change — traced automatically in seconds.',
    theme: {
      chip: 'bg-primary-100 dark:bg-primary-900/40',
      text: 'text-primary-700 dark:text-primary-300',
      border: 'border-primary-200 dark:border-primary-800/60',
      answerBg: 'bg-primary-50/70 dark:bg-primary-950/20',
      solid: 'bg-primary-600',
    },
  },
  {
    icon: '🔮',
    category: 'Forecasting',
    question: 'What should we expect our sales to look like in the coming months?',
    cannot: 'Gut feel, or a static spreadsheet trend line with no real accuracy behind it.',
    can: 'A forecast for any metric, any scope, next week, month or year.',
    theme: {
      chip: 'bg-violet-100 dark:bg-violet-900/40',
      text: 'text-violet-700 dark:text-violet-300',
      border: 'border-violet-200 dark:border-violet-800/60',
      answerBg: 'bg-violet-50/70 dark:bg-violet-950/20',
      solid: 'bg-violet-600',
    },
  },
  {
    icon: '🧩',
    category: 'Business Drivers',
    question: 'Which branches, categories, routes, or products are driving the change in our overall performance?',
    cannot: 'No single view pulls branch, category, route and product together.',
    can: 'The top 10 movers at every level, ranked by real ₹ impact, every time you ask.',
    theme: {
      chip: 'bg-accent-100 dark:bg-accent-900/40',
      text: 'text-accent-700 dark:text-accent-300',
      border: 'border-accent-200 dark:border-accent-800/60',
      answerBg: 'bg-accent-50/70 dark:bg-accent-950/20',
      solid: 'bg-accent-600',
    },
  },
  {
    icon: '⚠️',
    category: 'Early Risk Detection',
    question: 'Which areas of the business require attention before they significantly impact our results?',
    cannot: "Underperformance shows up in the closing report — after it's too late to fix.",
    can: 'Every branch and category forecast individually, so risk surfaces weeks before the quarter closes.',
    theme: {
      chip: 'bg-amber-100 dark:bg-amber-900/40',
      text: 'text-amber-700 dark:text-amber-300',
      border: 'border-amber-200 dark:border-amber-800/60',
      answerBg: 'bg-amber-50/70 dark:bg-amber-950/20',
      solid: 'bg-amber-500',
    },
  },
  {
    icon: '📈',
    category: 'Growth Quality',
    question: 'Is our overall growth sustainable, or is it being driven by a small number of products, branches, or customers?',
    cannot: 'A strong headline number can hide one outlier doing all the work, with no way to tell.',
    can: 'Every result automatically flagged as concentrated or broadly spread — durable growth, proven.',
    theme: {
      chip: 'bg-rose-100 dark:bg-rose-900/40',
      text: 'text-rose-700 dark:text-rose-300',
      border: 'border-rose-200 dark:border-rose-800/60',
      answerBg: 'bg-rose-50/70 dark:bg-rose-950/20',
      solid: 'bg-rose-500',
    },
  },
  {
    icon: '🎯',
    category: 'Forecast Reliability',
    question: 'How reliable is this forecast, and how confident should we be in using it for decision-making?',
    cannot: "Forecasts arrive with no idea how often they're actually right.",
    can: "Every number ships with its own measured error rate — and an honest refusal instead of a guess when nothing clears the bar.",
    theme: {
      chip: 'bg-emerald-100 dark:bg-emerald-900/40',
      text: 'text-emerald-700 dark:text-emerald-300',
      border: 'border-emerald-200 dark:border-emerald-800/60',
      answerBg: 'bg-emerald-50/70 dark:bg-emerald-950/20',
      solid: 'bg-emerald-600',
    },
  },
]

const PILLARS = [
  {
    icon: '🧩',
    tag: 'Decompose',
    title: 'Every answer, already in your data',
    body: "The answer to almost any question is already sitting in what you've already recorded — it just isn't reachable. We decompose every number down to the exact branch, category or product behind it, and hand it back in plain English.",
    proof: 'No dashboards to dig through. No database to query yourself. Ask, and it decomposes the answer for you.',
    theme: {
      border: 'border-primary-200 dark:border-primary-800/60',
      bg: 'from-primary-50 to-white dark:from-primary-950/40 dark:to-slate-900',
      chip: 'bg-primary-600',
      tagText: 'text-primary-700 dark:text-primary-300',
    },
  },
  {
    icon: '📈',
    tag: 'Predict',
    title: 'Every metric, every scope, already tested',
    body: 'Net sales, profit, units — for every branch, route, category, product, supplier and customer type — forecast for next week, next month or next year.',
    proof: '302 real scopes, each already tested against real held-back history, 6 models competing for every one — not a guess dressed up as a forecast.',
    theme: {
      border: 'border-accent-200 dark:border-accent-800/60',
      bg: 'from-accent-50 to-white dark:from-accent-950/40 dark:to-slate-900',
      chip: 'bg-accent-600',
      tagText: 'text-accent-700 dark:text-accent-300',
    },
  },
]

export function SolutionPage() {
  return (
    <div>
      {/* ---------- hero ---------- */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-primary-900 to-accent-800 p-6 text-white shadow-xl sm:p-10"
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-72 w-72 rounded-full bg-accent-400/20 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">The problem → our solution</p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-2 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl"
          >
            You already collect the data.{' '}
            <span className="bg-gradient-to-r from-amber-200 via-white to-accent-200 bg-clip-text text-transparent">
              You just can't get answers from it.
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-3 text-[15px] leading-relaxed text-white/80 sm:text-base"
          >
            An AI-native layer on top of what you already have — turning five years of
            transactions into instant answers, and real, tested predictions of what's next.
          </motion.p>
        </div>
      </motion.div>

      {/* ---------- six questions ---------- */}
      <div className="mt-10">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary-600 dark:text-primary-400">
          AI Intelligence
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
          Six Questions Every Business Leader Needs Answered
        </h2>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          From "What happened?" to "What should we do next?"
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {PROCESS_STEPS.map((step, i) => (
            <Fragment key={step}>
              <span className="rounded-full border border-primary-200 bg-primary-50 px-2.5 py-1 text-[11px] font-bold text-primary-700 dark:border-primary-800 dark:bg-primary-950/40 dark:text-primary-300">
                {step}
              </span>
              {i < PROCESS_STEPS.length - 1 && <span className="text-slate-300 dark:text-slate-600">→</span>}
            </Fragment>
          ))}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {QUESTIONS.map((q, i) => (
          <motion.div
            key={q.category}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className={`rounded-2xl border-2 bg-white p-5 dark:bg-slate-900 ${q.theme.border}`}
          >
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${q.theme.chip}`}
              >
                {q.icon}
              </span>
              <p className={`text-[11px] font-extrabold uppercase tracking-wide ${q.theme.text}`}>
                {i + 1}. {q.category}
              </p>
            </div>
            <p className="mt-3 text-[15px] font-bold italic leading-snug text-slate-900 dark:text-slate-50">
              "{q.question}"
            </p>

            <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
                <span
                  aria-hidden
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[11px] font-extrabold text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                >
                  ✕
                </span>
                <p className="text-[15px] font-semibold leading-snug text-slate-500 line-through decoration-slate-300 decoration-1 dark:text-slate-400 dark:decoration-slate-600">
                  {q.cannot}
                </p>
              </div>
              <div className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${q.theme.answerBg}`}>
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold text-white ${q.theme.solid}`}
                >
                  ✓
                </span>
                <p className={`text-base font-extrabold leading-snug ${q.theme.text}`}>{q.can}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ---------- transition ---------- */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.35 }}
        className="my-8 flex items-center justify-center gap-3"
      >
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-slate-300 dark:to-slate-700" />
        <motion.span
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="rounded-full border-2 border-primary-300 bg-primary-50 px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-primary-700 dark:border-primary-700 dark:bg-primary-950/50 dark:text-primary-300"
        >
          ↓ same data, different outcome
        </motion.span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-slate-300 dark:to-slate-700" />
      </motion.div>

      {/* ---------- the solution ---------- */}
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-emerald-600 dark:text-emerald-400">
          Our AI-native solution
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          Two things this product does
        </h2>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {PILLARS.map((pillar, i) => (
          <motion.div
            key={pillar.tag}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.45 + i * 0.12 }}
            whileHover={{ y: -3 }}
            className={`rounded-3xl border-2 ${pillar.theme.border} bg-gradient-to-br ${pillar.theme.bg} p-6 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)]`}
          >
            <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${pillar.theme.chip} text-xl shadow-sm`}>
              {pillar.icon}
            </span>
            <p className={`mt-3 text-xs font-extrabold uppercase tracking-[0.15em] ${pillar.theme.tagText}`}>
              {pillar.tag}
            </p>
            <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
              {pillar.title}
            </h3>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{pillar.body}</p>
            <div className="mt-4 rounded-xl border border-white/60 bg-white/60 px-3.5 py-2.5 dark:border-slate-700/60 dark:bg-slate-900/40">
              <p className="text-[13px] font-semibold leading-snug text-slate-700 dark:text-slate-300">
                {pillar.proof}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* ---------- continue ---------- */}
      <div className="mt-8 flex justify-end">
        <button
          type="button"
          onClick={() => {
            window.location.hash = 'model-lab'
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
          className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-br from-primary-600 to-accent-600 px-6 py-3.5 text-base font-bold text-white shadow-sm transition hover:shadow-md"
        >
          Continue to AI Native Solution →
        </button>
      </div>
    </div>
  )
}
