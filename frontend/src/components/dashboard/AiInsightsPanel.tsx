import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ApiError, getDashboardInsights } from '../../api/client'
import { DeclineExplanationCard } from '../AnswerSection/DeclineExplanationCard'
import type { DashboardFilters, DeclineExplanation } from '../../types/api'

export function AiInsightsPanel({ filters }: { filters: DashboardFilters }) {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    data: DeclineExplanation | null
  }>({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    getDashboardInsights(filters)
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Could not load AI insights.'
        setState({ loading: false, error: message, data: null })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.metric, filters.dimension, filters.dimension_value, filters.year])

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <span aria-hidden className="text-xl">
          ✨
        </span>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">AI Insights</h2>
        <span className="rounded-full bg-accent-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
          Auto-updates with filters
        </span>
      </div>

      <AnimatePresence mode="wait">
        {state.loading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-2 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
          >
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-3 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </motion.div>
        )}

        {state.error && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
          >
            ⚠️ {state.error}
          </motion.div>
        )}

        {!state.loading && !state.error && state.data && (
          <motion.div key="data" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <DeclineExplanationCard decline={state.data} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
