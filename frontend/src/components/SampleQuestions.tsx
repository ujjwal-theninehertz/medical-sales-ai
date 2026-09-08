import { motion } from 'framer-motion'
import { useMetadata } from '../context/MetadataContext'

function isWhy(q: string) {
  return /^why\b/i.test(q) || /driving/i.test(q)
}

export function SampleQuestions({ onPick }: { onPick: (question: string) => void }) {
  const { data } = useMetadata()
  if (!data) return null

  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Try a sample question
      </p>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.sample_questions.map((q, i) => {
          const why = isWhy(q)
          return (
            <motion.button
              key={q}
              type="button"
              onClick={() => onPick(q)}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: i * 0.02 }}
              whileHover={{ y: -2 }}
              className={`flex items-start gap-2.5 rounded-2xl border-2 px-4 py-3.5 text-left text-[15px] font-medium leading-snug shadow-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                why
                  ? 'border-accent-200 bg-accent-50/60 text-accent-950 hover:border-accent-400 hover:bg-accent-50 focus-visible:outline-accent-500 dark:border-accent-800/60 dark:bg-accent-950/30 dark:text-accent-50 dark:hover:border-accent-600'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-primary-300 hover:bg-primary-50/50 focus-visible:outline-primary-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <span aria-hidden className="mt-0.5 shrink-0 text-base">
                {why ? '🔎' : '📈'}
              </span>
              <span>{q}</span>
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
