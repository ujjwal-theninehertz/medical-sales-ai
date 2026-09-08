import { useConsoleLog } from '../../hooks/useConsoleLog'
import type { AskResponse } from '../../types/api'
import { DeclineExplanationCard } from './DeclineExplanationCard'
import { DimensionRefusalBanner } from './DimensionRefusalBanner'
import { LlmCallsDebugPanel } from './LlmCallsDebugPanel'
import { MetricResultCard } from './MetricResultCard'
import { ParametersUnderstood } from './ParametersUnderstood'

export function AnswerSection({ response }: { response: AskResponse }) {
  useConsoleLog(response.log)

  return (
    <div className="mt-6 space-y-4 border-t border-slate-200 pt-6 dark:border-slate-700">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Answer</h2>

      {response.parse_note && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          Question understanding fell back to '{response.parsed.horizon}': {response.parse_note}
        </div>
      )}

      {response.status === 'dimension_refused' ? (
        <DimensionRefusalBanner dimension={response.refused_dimension!} />
      ) : response.status === 'decline_explained' ? (
        <DeclineExplanationCard decline={response.decline!} />
      ) : response.status === 'decline_failed' ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          ⚠️ Couldn't compute that explanation right now: {response.decline_error}. Try asking
          again, or ask for a plain value instead.
        </div>
      ) : (
        <>
          <ParametersUnderstood parsed={response.parsed} />
          {response.metric_results?.map((r) => (
            <MetricResultCard key={r.metric} result={r} parsed={response.parsed} />
          ))}
          {response.llm_calls && <LlmCallsDebugPanel calls={response.llm_calls} />}
        </>
      )}
    </div>
  )
}
