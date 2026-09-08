import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ApiError, getDashboardInsights } from '../api/client'
import { DeclineExplanationCard } from '../components/AnswerSection/DeclineExplanationCard'
import { Badge, Card, SectionHead } from '../components/shell/primitives'
import type { DashboardFilters, DeclineExplanation } from '../types/api'
import { displayName } from '../utils/displayNames'

const TARGET_YEAR = 2025

interface Scope {
  id: string
  label: string
  dimension: string | null
  value: string | null
  depth: string
}

const SCOPES: Scope[] = [
  { id: 'whole', label: 'Whole business', dimension: null, value: null, depth: 'branch → category → product → driver' },
  { id: 'b02', label: displayName('branch', 'Medical Branch 02'), dimension: 'branch', value: 'Medical Branch 02', depth: 'category → product → driver' },
  { id: 'b05', label: displayName('branch', 'Medical Branch 05'), dimension: 'branch', value: 'Medical Branch 05', depth: 'category → product → driver' },
  { id: 'b12', label: displayName('branch', 'Medical Branch 12'), dimension: 'branch', value: 'Medical Branch 12', depth: 'category → product → driver' },
]

// Same 3-color rotation DeclineExplanationCard uses for its own drill-down levels, so this
// diagram and the live card beneath it read as one visual system, not two.
const NODE_THEME = [
  { ring: 'border-slate-300 dark:border-slate-600', bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-700 dark:text-slate-200' },
  { ring: 'border-primary-400 dark:border-primary-600', bg: 'bg-primary-100 dark:bg-primary-950/60', text: 'text-primary-800 dark:text-primary-200' },
  { ring: 'border-accent-400 dark:border-accent-600', bg: 'bg-accent-100 dark:bg-accent-950/60', text: 'text-accent-800 dark:text-accent-200' },
  { ring: 'border-amber-400 dark:border-amber-600', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-800 dark:text-amber-200' },
  { ring: 'border-emerald-400 dark:border-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-800 dark:text-emerald-200' },
]

const NODES = [
  { icon: '🏢', label: 'Total' },
  { icon: '🏬', label: 'Branch' },
  { icon: '🗂️', label: 'Category' },
  { icon: '💊', label: 'Product' },
  { icon: '🔬', label: 'Driver' },
]

export function DeepDivePage() {
  const [scopeId, setScopeId] = useState(SCOPES[1].id)
  const scope = SCOPES.find((s) => s.id === scopeId) ?? SCOPES[0]
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    data: DeclineExplanation | null
  }>({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, error: null, data: null })
    const filters: DashboardFilters = {
      metric: 'net_sales',
      dimension: scope.dimension,
      dimension_value: scope.value,
      grain: 'year',
      year: TARGET_YEAR,
    }
    getDashboardInsights(filters)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Could not load the live explanation.'
        setState({ loading: false, error: message, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [scope.dimension, scope.value])

  return (
    <div>
      <SectionHead eyebrow="Deep-dive intelligence" title="“Why did sales decrease?” — answered, not guessed">
        No model, no LLM arithmetic — just real transaction rows, walked one level at a time down
        to a single named product and its driver.
      </SectionHead>

      <Card className="overflow-x-auto">
        <div className="flex min-w-max items-center justify-center gap-2 px-2 py-6 sm:gap-4">
          {NODES.map((n, i) => {
            const theme = NODE_THEME[i % NODE_THEME.length]
            return (
              <motion.div
                key={n.label}
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.35, delay: i * 0.12, ease: 'easeOut' }}
                className="flex items-center gap-2 sm:gap-4"
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${theme.ring} ${theme.bg} text-3xl shadow-[var(--shadow-card)] sm:h-24 sm:w-24 sm:text-4xl`}>
                    <span aria-hidden>{n.icon}</span>
                  </div>
                  <p className={`text-sm font-extrabold sm:text-base ${theme.text}`}>{n.label}</p>
                </div>
                {i < NODES.length - 1 && (
                  <motion.span
                    aria-hidden
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3, delay: i * 0.12 + 0.15 }}
                    className="text-2xl font-bold text-slate-300 dark:text-slate-700 sm:text-3xl"
                  >
                    →
                  </motion.span>
                )}
              </motion.div>
            )
          })}
        </div>
        <p className="text-center text-sm font-medium text-slate-500 dark:text-slate-400">
          Every arrow is a real sum over recorded rows — always walked to full depth, symmetric for growth and decline.
        </p>
      </Card>

      <div className="mt-8">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-600 dark:text-accent-400">
          Live, from the running system
        </p>
        <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          Pick a scope and watch the real drill-down
        </h3>
      </div>

      <Card className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          {SCOPES.map((s) => {
            const active = s.id === scopeId
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setScopeId(s.id)}
                className={`rounded-xl border-2 px-3.5 py-2 text-left transition ${
                  active
                    ? 'border-primary-500 bg-primary-50 shadow-[var(--shadow-card-hover)] dark:border-primary-400 dark:bg-primary-950/50'
                    : 'border-slate-200 bg-white hover:border-primary-300 dark:border-slate-800 dark:bg-slate-900'
                }`}
              >
                <p className="text-[15px] font-bold text-slate-800 dark:text-slate-200">{s.label}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {s.depth}
                </p>
              </button>
            )
          })}
        </div>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Computed on request against {TARGET_YEAR} vs {TARGET_YEAR - 1} — nothing here is a stored screenshot.
        </p>
      </Card>

      <div className="mt-4">
        <AnimatePresence mode="wait">
          {state.loading && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)] dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400" />
                <p className="text-[15px] font-bold text-slate-800 dark:text-slate-200">
                  Walking {scope.label} — {scope.depth}
                </p>
                <Badge tone="brand">live</Badge>
              </div>
              <div className="mt-4 space-y-2.5">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="h-3 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
                    style={{ width: `${100 - i * 8}%` }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {state.error && (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border-2 border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              ⚠️ {state.error}
            </motion.div>
          )}

          {!state.loading && !state.error && state.data && (
            <motion.div
              key={`data-${scope.id}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <DeclineExplanationCard decline={state.data} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="mt-6 text-center text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        The LLM only narrates the numbers above — it never computes them, and its recommendation
        must name a real entity from the drill-down or a fallback replaces it.
      </p>
    </div>
  )
}
