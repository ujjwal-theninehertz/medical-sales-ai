import { useEffect, useRef, useState } from 'react'
import { ApiError, askQuestion, getDashboardSummary } from '../api/client'
import { AnswerSection } from '../components/AnswerSection'
import { AiInsightsPanel } from '../components/dashboard/AiInsightsPanel'
import { FilterBar } from '../components/dashboard/FilterBar'
import { KpiCard } from '../components/dashboard/KpiCard'
import { ScopeMatrixPanel } from '../components/dashboard/ScopeMatrixPanel'
import { TrendChart } from '../components/dashboard/TrendChart'
import { SampleQuestions } from '../components/SampleQuestions'
import { Card, SectionHead } from '../components/shell/primitives'
import type { AskResponse, DashboardFilters, DashboardSummary } from '../types/api'
import { displayName } from '../utils/displayNames'
import { MODEL_DOCS } from './modelDocs'

const DEFAULT_FILTERS: DashboardFilters = {
  metric: 'net_sales',
  dimension: null,
  dimension_value: null,
  grain: 'year',
  year: null,
}

const GROWTH_LABEL = { year: 'YoY', month: 'MoM', week: 'WoW' } as const

export function OverviewPage() {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS)
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: DashboardSummary | null }>({
    loading: true,
    error: null,
    data: null,
  })

  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [askError, setAskError] = useState<string | null>(null)
  const [answer, setAnswer] = useState<AskResponse | null>(null)

  async function ask() {
    if (!question.trim()) return
    setAsking(true)
    setAskError(null)
    try {
      setAnswer(await askQuestion(question))
    } catch (err) {
      setAnswer(null)
      setAskError(err instanceof ApiError ? err.message : 'Something went wrong with that question.')
    } finally {
      setAsking(false)
    }
  }

  // This effect can re-trigger itself (the year-sync setFilters below), and a user can change
  // filters again (e.g. drilling into a scope) before that self-triggered refetch resolves --
  // two requests end up in flight together. `cancelled` alone guards against setting state
  // after unmount, but not against an OLDER request's response resolving after a NEWER one's
  // and clobbering it; a monotonic request id closes that gap regardless of resolution order.
  const latestRequestId = useRef(0)

  useEffect(() => {
    let cancelled = false
    const requestId = ++latestRequestId.current
    setState((s) => ({ ...s, loading: true, error: null }))
    getDashboardSummary(filters)
      .then((data) => {
        if (cancelled || latestRequestId.current !== requestId) return
        setState({ loading: false, error: null, data })
        // filters.year starts null ("whatever the latest recorded year is") -- syncing the
        // resolved value back stops the Year dropdown from displaying whichever option happens
        // to be first while the KPIs show a different year.
        if (filters.year == null) setFilters((f) => (f.year == null ? { ...f, year: data.year } : f))
      })
      .catch((err: unknown) => {
        if (cancelled || latestRequestId.current !== requestId) return
        setState({
          loading: false,
          error: err instanceof ApiError ? err.message : 'Could not load the dashboard.',
          data: null,
        })
      })
    return () => {
      cancelled = true
    }
  }, [filters])

  const scopeLabel = filters.dimension_value
    ? `${filters.dimension} = ${displayName(filters.dimension, filters.dimension_value)}`
    : 'whole business'
  const currentPeriod =
    state.data && state.data.grain !== 'year' ? state.data.current_period_label : state.data?.year
  const comparisonCaption =
    state.data &&
    (state.data.grain === 'year'
      ? `${state.data.comparison_year} → ${state.data.year}`
      : `${state.data.comparison_period_label} → ${state.data.current_period_label}`)

  return (
    <div>
      <SectionHead eyebrow="Current status" title="Where the business stands right now">
        Pick a grain — week, month or year — and a scope. Every figure below is the latest complete
        period for that selection, compared with the one before it, computed from real recorded
        transactions. The forecast card is the only projected number, and it names the model behind
        it along with that model's measured accuracy.
      </SectionHead>

      <FilterBar filters={filters} onChange={setFilters} />

      {state.data ? (
        <p
          className={`mt-2.5 flex flex-wrap items-center gap-2 text-[13px] font-semibold text-slate-500 transition-opacity dark:text-slate-400 ${
            state.loading ? 'opacity-50' : 'opacity-100'
          }`}
        >
          {currentPeriod} · {scopeLabel}
          {state.loading && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-primary-700 dark:bg-primary-950/50 dark:text-primary-300">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400" />
              Updating
            </span>
          )}
        </p>
      ) : (
        <div className="mt-2.5 h-4 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
      )}

      {state.error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          ⚠️ {state.error}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard
          label="Total Sales"
          icon="💰"
          index={0}
          kpi={state.data?.total_sales ?? { value: null, unavailable_reason: 'loading' }}
          growthPct={state.data?.total_sales_growth_pct}
          growthLabel={GROWTH_LABEL[filters.grain]}
          loading={state.loading}
        />
        <KpiCard
          label="Profit"
          icon="📈"
          index={1}
          kpi={state.data?.total_profit ?? { value: null, unavailable_reason: 'loading' }}
          growthPct={state.data?.total_profit_growth_pct}
          growthLabel={GROWTH_LABEL[filters.grain]}
          loading={state.loading}
        />
        <KpiCard
          label="Forecast"
          icon="🔮"
          index={2}
          kpi={state.data?.forecast ?? { value: null, unavailable_reason: 'loading' }}
          sub={
            state.data?.forecast_period_label
              ? `for ${state.data.forecast_period_label}` +
                (state.data.forecast_model
                  ? ` · via ${MODEL_DOCS[state.data.forecast_model]?.label ?? state.data.forecast_model}`
                  : '')
              : undefined
          }
          loading={state.loading}
        />
        <KpiCard
          label="Growth %"
          icon="📊"
          index={3}
          kpi={{ value: state.data?.growth_pct ?? null }}
          sub={comparisonCaption || undefined}
          loading={state.loading}
        />
        <KpiCard
          label="Forecast Confidence"
          icon="🎯"
          index={4}
          kpi={{
            value: null,
            unavailable_reason: state.data?.forecast.unavailable_reason ?? 'no forecast to rate',
          }}
          textValue={state.data?.confidence_level ?? undefined}
          sub={state.data?.confidence_reason ?? undefined}
          loading={state.loading}
        />
      </div>

      <div className="mt-4">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-600 dark:text-primary-400">
                Trend
              </p>
              <h3 className="mt-1 text-2xl font-extrabold capitalize text-slate-900 dark:text-slate-50">
                {state.data?.metric_label ?? 'Net sales'}
              </h3>
              <p className="mt-0.5 text-[13px] font-medium text-slate-500 dark:text-slate-400">
                Actual history vs. forecast, by {state.data?.grain ?? 'year'}
              </p>
            </div>
            {state.data?.growth_pct != null && (
              <div
                className={`rounded-2xl px-4 py-2.5 text-right ${
                  state.data.growth_pct >= 0
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600'
                    : 'bg-gradient-to-br from-red-500 to-rose-600'
                }`}
              >
                <p className="tabular-figure text-2xl font-extrabold text-white">
                  {state.data.growth_pct >= 0 ? '↑' : '↓'} {Math.abs(state.data.growth_pct).toFixed(1)}%
                </p>
                <p className="text-[10.5px] font-semibold text-white/80">{comparisonCaption}</p>
              </div>
            )}
          </div>

          <TrendChart
            history={state.data?.history_chart ?? []}
            forecastPoint={state.data?.forecast_point}
            modelForecasts={state.data?.all_model_forecasts}
            championModel={state.data?.forecast_model}
            metricLabel={state.data?.metric_label ?? 'value'}
            grain={state.data?.grain}
            loading={state.loading}
          />
        </Card>
      </div>

      <div className="mt-4">
        <AiInsightsPanel filters={filters} />
      </div>

      <div className="mt-4">
        <ScopeMatrixPanel
          metric={filters.metric}
          grain={filters.grain}
          onDrillTo={(dimension, value) => {
            setFilters((f) => ({ ...f, dimension, dimension_value: value }))
            // The KPIs/chart this updates sit above the fold from where the matrix row was
            // clicked -- without this the numbers change with no visible cue that they did.
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        />
      </div>

      {/* ---------- Ask the Questions ---------- */}
      <div className="mt-10 rounded-3xl border-2 border-primary-200 bg-gradient-to-br from-primary-50/60 via-white to-accent-50/40 p-6 dark:border-primary-800/60 dark:from-primary-950/30 dark:via-slate-900 dark:to-accent-950/20 sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-600 text-xl shadow-sm">
            ✨
          </span>
          <SectionHead eyebrow="Ask AI" title="Ask the Questions">
            The same engine, reached by question rather than by dropdown. Ask <b>what</b> a figure
            will be, or <b>why</b> one moved — the answer always comes from a model that already
            won a real backtest, never a guess.
          </SectionHead>
        </div>

        <SampleQuestions onPick={setQuestion} />

        <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            placeholder="e.g. Why did Vancouver Branch sales change in 2025?"
            className="flex-1 rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
          />
          <button
            type="button"
            onClick={ask}
            disabled={asking || !question.trim()}
            className="flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 text-base font-bold text-white shadow-sm transition hover:bg-primary-700 disabled:opacity-50"
          >
            {asking ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Asking…
              </>
            ) : (
              'Ask'
            )}
          </button>
        </div>

        {askError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            {askError}
          </div>
        )}

        {answer && <AnswerSection response={answer} />}
      </div>
    </div>
  )
}
