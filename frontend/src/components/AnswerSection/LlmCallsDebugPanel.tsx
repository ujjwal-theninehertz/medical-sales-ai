import type { LlmCallLog } from '../../types/api'

export function LlmCallsDebugPanel({ calls }: { calls: LlmCallLog[] }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <summary className="cursor-pointer text-sm font-semibold text-slate-800 dark:text-slate-200">
        Sent to the model, and what came back ({calls.length} call{calls.length !== 1 ? 's' : ''})
      </summary>
      <div className="mt-3 space-y-4">
        {calls.map((call, i) => (
          <div key={i} className={i < calls.length - 1 ? 'border-b border-slate-200 pb-4 dark:border-slate-700' : ''}>
            <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-400">Call {i + 1}</p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {call.inputs.join('\n\n')}
            </pre>
            <p className="my-1 text-xs text-slate-400">↓ response</p>
            <pre className="overflow-x-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {call.output}
            </pre>
          </div>
        ))}
      </div>
    </details>
  )
}
