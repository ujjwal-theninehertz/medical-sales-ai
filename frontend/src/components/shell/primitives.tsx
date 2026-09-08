import { motion } from 'framer-motion'
import { useEffect, useRef, useState, type ReactNode } from 'react'

// Shared layout primitives for every page. These are the reference demo page's structural
// patterns -- numbered nav, eyebrow/headline section heads, cards, a terminal console, ⓘ tips
// -- rendered in this app's own indigo/teal brand rather than the reference's cream/gold.

export function SectionHead({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mb-6 max-w-4xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600 dark:text-primary-400">
        {eyebrow}
      </p>
      <h2 className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
        {title}
      </h2>
      {children && (
        <p className="mt-2.5 text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg">{children}</p>
      )}
    </div>
  )
}

export function Card({
  children,
  className = '',
  title,
  tip,
  action,
}: {
  children: ReactNode
  className?: string
  title?: string
  tip?: string
  action?: ReactNode
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)] dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && (
            <h3 className="flex items-center gap-1.5 text-base font-bold text-slate-900 dark:text-slate-100">
              {title}
              {tip && <InfoTip>{tip}</InfoTip>}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

export function InfoTip({ children }: { children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        role="note"
        className="flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[9px] font-bold text-slate-500 transition hover:border-primary-400 hover:text-primary-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500 dark:border-slate-600 dark:text-slate-400"
      >
        i
      </span>
      <span className="pointer-events-none absolute left-1/2 top-6 z-40 w-72 -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3.5 text-sm font-normal leading-relaxed text-slate-600 opacity-0 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
        {children}
      </span>
    </span>
  )
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">
      {children}
    </p>
  )
}

const TONE: Record<string, string> = {
  good: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  brand: 'bg-primary-100 text-primary-800 dark:bg-primary-950 dark:text-primary-300',
  accent: 'bg-accent-100 text-accent-800 dark:bg-accent-950 dark:text-accent-300',
  muted: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
}

export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode
  tone?: 'good' | 'warn' | 'bad' | 'brand' | 'accent' | 'muted'
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${TONE[tone]}`}
    >
      {children}
    </span>
  )
}

/** Terminal-style log panel. Lines reveal one at a time so a client watches the pipeline run
 *  rather than seeing a finished wall of text -- the reveal is cosmetic, every line is real
 *  output from the backend. `revealMs=0` renders everything immediately. */
export function Console({
  lines,
  placeholder = 'Nothing has run yet.',
  revealMs = 90,
  height = 'h-72',
}: {
  lines: string[]
  placeholder?: string
  revealMs?: number
  height?: string
}) {
  // Start empty when animating, or the first paint flashes the whole log before the reveal
  // effect resets it to zero.
  const [shown, setShown] = useState(revealMs === 0 ? lines.length : 0)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (revealMs === 0 || lines.length === 0) {
      setShown(lines.length)
      return
    }
    setShown(0)
    let i = 0
    const timer = setInterval(() => {
      i += 1
      setShown(i)
      if (i >= lines.length) clearInterval(timer)
    }, revealMs)
    return () => clearInterval(timer)
  }, [lines, revealMs])

  useEffect(() => {
    const el = boxRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [shown])

  return (
    <div
      ref={boxRef}
      className={`${height} overflow-y-auto rounded-xl bg-[#12191a] p-4 font-mono text-[11.5px] leading-relaxed`}
    >
      {lines.length === 0 ? (
        <span className="text-slate-500">{placeholder}</span>
      ) : (
        lines.slice(0, shown).map((line, i) => (
          <motion.div
            key={`${i}-${line.slice(0, 24)}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="whitespace-pre-wrap break-words text-[#67d9b6]"
          >
            <span className="select-none text-[#2f6b5c]">{String(i + 1).padStart(2, '0')} </span>
            {line}
          </motion.div>
        ))
      )}
      {shown < lines.length && (
        <span className="inline-block h-3.5 w-2 animate-pulse bg-[#67d9b6] align-middle" />
      )}
    </div>
  )
}

/** A labelled figure. `mono` aligns digits for table-like reading. */
export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  tone?: string
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <p className={`tabular-figure mt-1 text-[1.75rem] font-extrabold ${tone ?? 'text-slate-900 dark:text-slate-50'}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-sm font-medium text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
}

export function DataTable({
  head,
  children,
}: {
  head: ReactNode[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {head.map((h, i) => (
              <th
                key={i}
                className={`whitespace-nowrap px-2.5 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${
                  i === 0 ? 'text-left' : 'text-right'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
