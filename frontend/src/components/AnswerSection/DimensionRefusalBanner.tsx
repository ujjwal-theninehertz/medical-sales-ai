import { useMetadata } from '../../context/MetadataContext'
import { displayName } from '../../utils/displayNames'

// Mirrors app.py lines 164-183 exactly: a dimension type was recognized (branch/route/...)
// but no single real value matched -- either a generic/ranking question or an unrecognized
// name. Answering at the whole-business level instead (silently) would answer a different
// question than the one asked, so this refuses explicitly with the real names it does know.
export function DimensionRefusalBanner({ dimension }: { dimension: string }) {
  const { data } = useMetadata()
  const realValues = data?.dimension_values[dimension]

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
        This looks like a <strong>{dimension}</strong>-level question, but not about one
        specific, recognized {dimension} — this system doesn't rank or compare across all{' '}
        {dimension}s yet, and can't answer for a name it doesn't recognize.{' '}
        {realValues && realValues.length > 0
          ? `Ask about one specific ${dimension} by name instead.`
          : `No ${dimension}-level data is tracked yet.`}
      </div>
      {realValues && realValues.length > 0 && (
        <details className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-300">
            Real {dimension} names this could answer for
          </summary>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {realValues.map((v) => displayName(dimension, v)).join(', ')}
          </p>
        </details>
      )}
    </div>
  )
}
