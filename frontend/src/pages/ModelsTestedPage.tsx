import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { ApiError, getBacktests } from '../api/client'
import { Badge, Card, DataTable, InfoTip, SectionHead, Stat } from '../components/shell/primitives'
import type { BacktestsResponse, Grain, ModelScore, Statistic, WholeBusinessBacktest } from '../types/api'
import { KIND_LABEL, MODEL_DOCS } from './modelDocs'

const GRAINS: Grain[] = ['month', 'week', 'year']

const GRAIN_LABEL: Record<Grain, string> = { week: 'Weekly', month: 'Monthly', year: 'Yearly' }

const STAT_LABEL: Record<Statistic, string> = { mape: 'MAPE', diff_pct: 'Full-year difference' }

const STAT_TIP: Record<Statistic, string> = {
  mape: 'Mean absolute percentage error: every held-back period of 2025 is scored on its own, then those errors are averaged. Lower is better.',
  diff_pct:
    'A single comparison — the forecast 2025 total against the recorded 2025 total. Within-year misses can cancel out, so this is a different statistic from MAPE and the two are never mixed.',
}

const KIND_TONE = { statistical: 'muted', foundation: 'brand', llm: 'accent' } as const

const METHOD: { n: string; title: string; body: string }[] = [
  {
    n: '01',
    title: 'Split once, and hold 2025 back entirely',
    body: 'Every candidate is fitted on 2021–2024 only. No model sees a single row of 2025 before it is scored on it.',
  },
  {
    n: '02',
    title: 'Run all six on the same series',
    body: 'One contest is one (metric × scope × grain) triple. All six candidates forecast that exact series, from the same training window.',
  },
  {
    n: '03',
    title: 'Score with the statistic the grain allows',
    body: 'Week and month have many held-back periods, so they are scored by MAPE. A year has one, so it is scored by the difference between forecast total and recorded total.',
  },
  {
    n: '04',
    title: 'Rank, and take the winner as champion',
    body: 'The best score wins that contest and is stored as its champion. Nothing is chosen at request time — a forecast only ever runs a model that already won this scope offline.',
  },
  {
    n: '05',
    title: 'Refuse what the winner cannot support',
    body: 'Winning is not enough. A champion whose own measured error is above the reliability floor is rejected, and that scope returns nothing rather than a weak number.',
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

function modelLabel(model: string) {
  return MODEL_DOCS[model]?.label ?? model
}

function signed(v: number | null | undefined) {
  if (v == null) return '—'
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
}

function winsFor(data: BacktestsResponse, grain: Grain): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const row of data.dimensional) {
    if (row.grain !== grain) continue
    for (const [model, wins] of Object.entries(row.champion_wins)) {
      totals[model] = (totals[model] ?? 0) + wins
    }
  }
  return totals
}

function contestsFor(data: BacktestsResponse, grain: Grain) {
  return data.dimensional
    .filter((row) => row.grain === grain)
    .reduce((sum, row) => sum + row.values_tested, 0)
}

function ContestCard({ contest }: { contest: WholeBusinessBacktest }) {
  const isYear = contest.statistic === 'diff_pct'
  return (
    <Card
      title={`${contest.metric_label} · ${GRAIN_LABEL[contest.grain].toLowerCase()}`}
      action={<Badge tone={isYear ? 'accent' : 'brand'}>{STAT_LABEL[contest.statistic]}</Badge>}
    >
      {contest.actual != null && (
        <p className="mb-2.5 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          Recorded 2025 total: <b className="tabular-figure">{fmt(contest.actual)}</b>
        </p>
      )}
      <DataTable
        head={[
          'Model',
          isYear ? 'Predicted' : 'MAE',
          <span key="err" className="inline-flex items-center gap-1">
            {STAT_LABEL[contest.statistic]}
            <InfoTip>{STAT_TIP[contest.statistic]}</InfoTip>
          </span>,
        ]}
      >
        {contest.scores.map((s: ModelScore) => (
          <tr
            key={s.model}
            className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${
              s.is_champion ? 'bg-primary-50/60 dark:bg-primary-950/30' : ''
            }`}
          >
            <td className="px-2.5 py-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200">
                  {modelLabel(s.model)}
                </span>
                {s.is_champion && <Badge tone="good">★ champion</Badge>}
              </div>
            </td>
            <td className="tabular-figure px-2.5 py-2 text-right text-[13px] text-slate-500 dark:text-slate-400">
              {isYear ? fmt(s.predicted) : fmt(s.mae)}
            </td>
            <td className={`tabular-figure px-2.5 py-2 text-right text-[13px] font-bold ${errTone(s.error_pct)}`}>
              {isYear ? signed(s.diff_pct) : `${fmt(s.mape, 1)}%`}
            </td>
          </tr>
        ))}
      </DataTable>
    </Card>
  )
}

export function ModelsTestedPage() {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    data: BacktestsResponse | null
  }>({ loading: true, error: null, data: null })
  const [grain, setGrain] = useState<Grain>('month')

  useEffect(() => {
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    getBacktests()
      .then((data) => {
        if (!cancelled) setState({ loading: false, error: null, data })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Could not load the backtest results.'
        setState({ loading: false, error: message, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const data = state.data
  const roster = data?.whole_business.filter((w) => w.grain === 'month') ?? []
  const primary = roster[0]
  const primaryWeek = data?.whole_business.find((w) => w.metric === primary?.metric && w.grain === 'week')
  const primaryYear = data?.whole_business.find((w) => w.metric === primary?.metric && w.grain === 'year')
  const contests = data?.whole_business.filter((w) => w.grain === grain) ?? []
  const dimensional = data?.dimensional.filter((row) => row.grain === grain) ?? []
  const totalContests = data ? GRAINS.reduce((sum, g) => sum + contestsFor(data, g), 0) : 0
  const winsByGrain: Record<Grain, Record<string, number>> = {
    month: data ? winsFor(data, 'month') : {},
    week: data ? winsFor(data, 'week') : {},
    year: data ? winsFor(data, 'year') : {},
  }
  const wins = GRAINS.map((g) => ({
    grain: g,
    counts: winsByGrain[g],
    top: Math.max(0, ...Object.values(winsByGrain[g])),
  }))
  const wholeBusinessChampions = new Set(data?.whole_business.map((w) => w.champion) ?? [])
  const soleChampion = wholeBusinessChampions.size === 1 ? [...wholeBusinessChampions][0] : null

  return (
    <div>
      <SectionHead eyebrow="Models tested" title="Six candidates, scored on a year they never saw">
        Nothing here is a claim about how a model should behave. Six candidates — three cheap
        baselines, a fitted trend, a pretrained foundation model and a large language model — were
        each run against the same held-back 2025, and every number on this page is the score that
        came out. The winner of each contest became that scope's champion; the losers are shown next
        to it so the margin is visible.
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
                <Stat label="Candidates per contest" value={data.coverage.candidates_per_contest} sub="all six, every time" />
                <Stat label="Train → test" value={`${data.train_period} → ${data.test_period}`} sub="2025 held back entirely" />
                <Stat label="Dimensional contests" value={fmt(totalContests)} sub="scored across 3 grains" />
                <Stat
                  label="Reliability floor"
                  value={`${data.reliability_floor_pct}%`}
                  sub="above this, a winner is refused"
                />
              </div>
            </Card>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card
                title="The six candidates, ranked"
                className="lg:col-span-2"
                tip="Ranked by whole-business monthly MAPE. The three columns are three different statistics measured on three different grains — they are shown side by side for reading, never combined."
              >
                <DataTable
                  head={[
                    'Candidate',
                    <span key="m" className="inline-flex items-center gap-1">
                      Monthly MAPE
                      <InfoTip>{STAT_TIP.mape}</InfoTip>
                    </span>,
                    'Weekly MAPE',
                    <span key="y" className="inline-flex items-center gap-1">
                      2025 full-year
                      <InfoTip>{STAT_TIP.diff_pct}</InfoTip>
                    </span>,
                  ]}
                >
                  {roster[0]?.scores.map((s) => {
                    const doc = MODEL_DOCS[s.model]
                    const week = primaryWeek?.scores.find((w) => w.model === s.model)
                    const year = primaryYear?.scores.find((y) => y.model === s.model)
                    return (
                      <tr key={s.model} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                        <td className="px-2.5 py-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] font-bold text-slate-800 dark:text-slate-200">
                              {modelLabel(s.model)}
                            </span>
                            {doc && <Badge tone={KIND_TONE[doc.kind]}>{KIND_LABEL[doc.kind]}</Badge>}
                          </div>
                          <p className="mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                            {data.reasons[s.model] ?? doc?.oneLiner}
                          </p>
                        </td>
                        <td className={`tabular-figure px-2.5 py-2 text-right text-[13px] font-bold ${errTone(s.mape)}`}>
                          {fmt(s.mape, 1)}%
                        </td>
                        <td
                          className={`tabular-figure px-2.5 py-2 text-right text-[13px] font-bold ${errTone(week?.mape)}`}
                        >
                          {fmt(week?.mape, 1)}%
                        </td>
                        <td
                          className={`tabular-figure px-2.5 py-2 text-right text-[13px] font-bold ${errTone(
                            year?.error_pct,
                          )}`}
                        >
                          {signed(year?.diff_pct)}
                        </td>
                      </tr>
                    )
                  })}
                </DataTable>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                  Columns are {primary?.metric_label ?? 'net sales'} at whole-business level. The
                  full-year column is signed: a negative figure means the model forecast more than
                  the business actually recorded.
                </p>
              </Card>

              <Card title="How each contest was run">
                <ol className="space-y-2.5">
                  {METHOD.map((m) => (
                    <li key={m.n} className="flex gap-2.5">
                      <span className="tabular-figure mt-0.5 text-[10px] font-bold text-primary-600 dark:text-primary-400">
                        {m.n}
                      </span>
                      <span className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                        <b className="text-slate-800 dark:text-slate-200">{m.title}.</b> {m.body}
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
            </div>

            <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-primary-600 dark:text-primary-400">
                  Contest results
                </p>
                <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
                  Every score, at {GRAIN_LABEL[grain].toLowerCase()} grain
                </h3>
              </div>
              <div className="flex gap-2">
                {GRAINS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGrain(g)}
                    className={`rounded-xl border-2 px-3.5 py-2 text-[13px] font-bold transition ${
                      grain === g
                        ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-950/50 dark:text-primary-300'
                        : 'border-slate-300 bg-white text-slate-600 hover:border-primary-300 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {GRAIN_LABEL[g]}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
              {contests.map((c) => (
                <ContestCard key={`${c.metric}-${c.grain}`} contest={c} />
              ))}
            </div>

            <Card
              className="mt-4"
              title={`Dimensional contests · ${GRAIN_LABEL[grain].toLowerCase()}`}
              tip="Each row averages every scope inside that dimension — 200 products, 30 routes, 15 branches, and so on. Model columns are that model's average error across all of them; the last column is the average of whichever model won each one."
              action={
                <Badge tone={grain === 'year' ? 'accent' : 'brand'}>
                  {STAT_LABEL[dimensional[0]?.statistic ?? 'mape']}
                </Badge>
              }
            >
              <DataTable
                head={[
                  'Dimension',
                  'Scopes',
                  ...data.candidates.map((m) => modelLabel(m)),
                  <span key="ca" className="inline-flex items-center gap-1">
                    Champion avg
                    <InfoTip>
                      This is not a seventh model. It is the best-of-six selection effect: for each
                      scope the winning model's score is taken, and those are averaged. It reads
                      lower than every single column because a different model wins in different
                      places.
                    </InfoTip>
                  </span>,
                ]}
              >
                {dimensional.map((row) => {
                  const best = Math.min(...Object.values(row.per_model_avg))
                  return (
                    <tr key={row.dimension} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-2.5 py-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                        {row.dimension.replace('_', ' ')}
                      </td>
                      <td className="tabular-figure px-2.5 py-2 text-right text-[13px] text-slate-500 dark:text-slate-400">
                        {row.values_tested}
                      </td>
                      {data.candidates.map((m) => {
                        const v = row.per_model_avg[m]
                        return (
                          <td
                            key={m}
                            className={`tabular-figure px-2.5 py-2 text-right text-[13px] ${
                              v === best
                                ? 'font-extrabold text-slate-800 dark:text-slate-100'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {fmt(v, 1)}%
                          </td>
                        )
                      })}
                      <td className="tabular-figure bg-primary-50/60 px-2.5 py-2 text-right text-[13px] font-extrabold text-primary-700 dark:bg-primary-950/30 dark:text-primary-300">
                        {fmt(row.champion_avg, 1)}%
                      </td>
                    </tr>
                  )
                })}
              </DataTable>
              <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed font-medium text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
                Read the last column carefully. <b>Champion avg is a selection effect, not a model.</b>{' '}
                No candidate scores that well on its own — the figure exists only because the choice
                is made per scope after all six have been measured.
              </p>
            </Card>

            <Card className="mt-4" title="Who actually won, contest by contest" tip="One winner per dimensional contest, counted by grain. These are outright wins, not averages.">
              <DataTable head={['Model', 'Monthly wins', 'Weekly wins', 'Yearly wins']}>
                {data.candidates.map((m) => (
                  <tr key={m} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                    <td className="px-2.5 py-2 text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                      {modelLabel(m)}
                    </td>
                    {wins.map((w) => (
                      <td
                        key={w.grain}
                        className={`tabular-figure px-2.5 py-2 text-right text-[13px] ${
                          (w.counts[m] ?? 0) === w.top
                            ? 'font-extrabold text-primary-700 dark:text-primary-300'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        {w.counts[m] ?? 0}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                  <td className="px-2.5 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Contests scored
                  </td>
                  {GRAINS.map((g) => (
                    <td
                      key={g}
                      className="tabular-figure px-2.5 py-2 text-right text-[13px] font-bold text-slate-800 dark:text-slate-200"
                    >
                      {contestsFor(data, g)}
                    </td>
                  ))}
                </tr>
              </DataTable>
            </Card>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white px-5 py-4 dark:border-primary-800 dark:from-primary-950/40 dark:to-slate-900">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span aria-hidden className="text-lg">
                    🏆
                  </span>
                  <p className="text-sm font-extrabold uppercase tracking-wide text-primary-700 dark:text-primary-300">
                    The champion at whole-business level
                  </p>
                </div>
                {soleChampion && (
                  <>
                    <p className="mt-2 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                      <b>{modelLabel(soleChampion)}</b> won all {data.whole_business.length} whole-business
                      contests — {new Set(data.whole_business.map((w) => w.metric)).size} metrics ×{' '}
                      {GRAINS.length} grains — with no exceptions. It is{' '}
                      {data.reasons[soleChampion]?.split('--')[0].trim()}, and its claim to being
                      champion rests on those measured scores alone, not on what it is built from.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {data.whole_business.map((w) => (
                        <span
                          key={`${w.metric}-${w.grain}`}
                          className="tabular-figure rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {w.metric_label} {w.grain} · {fmt(w.scores[0]?.error_pct, 1)}%
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-2xl border-2 border-accent-200 bg-gradient-to-br from-accent-50 to-white px-5 py-4 dark:border-accent-800 dark:from-accent-950/40 dark:to-slate-900">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span aria-hidden className="text-lg">
                    🎯
                  </span>
                  <p className="text-sm font-extrabold uppercase tracking-wide text-accent-700 dark:text-accent-300">
                    …and why that is not the whole story
                  </p>
                </div>
                <p className="mt-2 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                  Below the business total, no single model wins everywhere. Chronos-2 takes{' '}
                  {winsByGrain.week.chronos ?? 0} of {contestsFor(data, 'week')} weekly contests but only{' '}
                  {winsByGrain.year.chronos ?? 0} of {contestsFor(data, 'year')} yearly ones, where linear
                  trend leads on {winsByGrain.year.linear_trend ?? 0}. Even the naive baseline wins{' '}
                  {winsByGrain.week.naive_last_value ?? 0} weekly scopes outright. Picking one
                  model globally would have been the wrong model for most of the business — which is
                  the entire justification for selecting a champion per metric × scope × grain.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
