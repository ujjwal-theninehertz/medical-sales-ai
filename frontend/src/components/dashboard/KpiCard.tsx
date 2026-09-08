import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useEffect } from 'react'
import { formatCompact, formatPct } from '../../utils/formatNumber'
import type { KpiValue } from '../../types/api'

function CountUp({ value }: { value: number }) {
  const motionVal = useMotionValue(0)
  const display = useTransform(motionVal, (v) => formatCompact(v))

  useEffect(() => {
    const controls = animate(motionVal, value, { duration: 0.8, ease: 'easeOut' })
    return controls.stop
  }, [value, motionVal])

  return <motion.span>{display}</motion.span>
}

interface KpiCardProps {
  label: string
  kpi: KpiValue
  growthPct?: number | null
  icon: string
  sub?: string
  index: number
  /** Overrides the numeric count-up with plain text -- for categorical KPIs like a
   * confidence level, where there's no meaningful number to animate. */
  textValue?: string
  /** Suffix after the growth badge -- "YoY"/"MoM"/"WoW" depending on the selected grain. */
  growthLabel?: string
  /** True only while there is no data at all yet (first load) -- an in-flight refetch that
   *  already has stale data to show keeps showing it rather than flashing a skeleton. */
  loading?: boolean
}

const CONFIDENCE_COLOR: Record<string, string> = {
  high: 'text-emerald-600 dark:text-emerald-400',
  moderate: 'text-amber-600 dark:text-amber-400',
  low: 'text-red-600 dark:text-red-400',
}

export function KpiCard({
  label,
  kpi,
  growthPct,
  icon,
  sub,
  index,
  textValue,
  growthLabel = 'YoY',
  loading,
}: KpiCardProps) {
  const trendColor =
    growthPct == null
      ? 'text-slate-500 dark:text-slate-400'
      : growthPct > 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : growthPct < 0
          ? 'text-red-600 dark:text-red-400'
          : 'text-slate-500 dark:text-slate-400'

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)] dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
        <span aria-hidden className="text-base opacity-70">
          {icon}
        </span>
      </div>

      {loading ? (
        <div className="mt-2.5 space-y-2">
          <div className="h-7 w-20 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-14 animate-pulse rounded bg-slate-100 dark:bg-slate-800/70" />
        </div>
      ) : (
        <>
          {textValue ? (
            <p className={`mt-2 text-2xl font-semibold capitalize ${CONFIDENCE_COLOR[textValue] ?? 'text-slate-900 dark:text-slate-100'}`}>
              {textValue}
            </p>
          ) : kpi.value != null ? (
            <p className="tabular-figure mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
              <CountUp value={kpi.value} />
            </p>
          ) : (
            <p className="mt-2 text-sm leading-snug text-slate-400 dark:text-slate-500">
              Not available — {kpi.unavailable_reason}
            </p>
          )}

          {growthPct !== undefined && kpi.value != null && (
            <p className={`mt-1 text-xs font-medium ${trendColor}`}>
              {growthPct != null && growthPct > 0 ? '↑' : growthPct != null && growthPct < 0 ? '↓' : '→'}{' '}
              {formatPct(growthPct)} {growthLabel}
            </p>
          )}
          {sub && (kpi.value != null || textValue) && (
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{sub}</p>
          )}
        </>
      )}
    </motion.div>
  )
}
