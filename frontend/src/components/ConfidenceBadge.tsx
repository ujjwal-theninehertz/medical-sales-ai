const STYLES: Record<string, string> = {
  high: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  moderate:
    'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200',
  low: 'border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200',
}
const ICONS: Record<string, string> = { high: '🟢', moderate: '🟡', low: '🔴' }

export function ConfidenceBadge({ level, reason }: { level: 'high' | 'moderate' | 'low'; reason: string }) {
  return (
    <div className={`rounded-xl border px-3 py-2 text-sm ${STYLES[level] ?? STYLES.moderate}`}>
      {ICONS[level] ?? '🟢'} <strong>{level.charAt(0).toUpperCase() + level.slice(1)} confidence</strong> — {reason}.
    </div>
  )
}
