import { useMetadata } from '../../context/MetadataContext'
import type { ParsedParams } from '../../types/api'
import { displayName } from '../../utils/displayNames'
import { monthName } from '../../utils/formatPeriodLabel'

export function ParametersUnderstood({ parsed }: { parsed: ParsedParams }) {
  const { data } = useMetadata()

  const dimensionLine = parsed.dimension_value
    ? `${parsed.dimension} = ${displayName(parsed.dimension, parsed.dimension_value)}`
    : parsed.dimension
      ? `${parsed.dimension} (no specific value)`
      : 'none — whole business'

  const metricsLine = parsed.metrics.map((m) => data?.metric_labels[m] ?? m).join(', ')

  return (
    <details open className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
        Parameters understood from your question
      </summary>
      <ul className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-300">
        <li>
          <strong>Horizon:</strong> {parsed.horizon}
        </li>
        <li>
          <strong>Year:</strong> {parsed.explicit_year ?? <em>not specified</em>}
        </li>
        <li>
          <strong>Month:</strong> {parsed.explicit_month ? monthName(parsed.explicit_month) : <em>not specified</em>}
        </li>
        <li>
          <strong>Dimension:</strong> {dimensionLine}
        </li>
        <li>
          <strong>Metric(s):</strong> {metricsLine}
        </li>
      </ul>
    </details>
  )
}
