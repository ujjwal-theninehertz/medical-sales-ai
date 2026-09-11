import type { JSX } from 'react'
import type { DeclineBreakdownRow, DeclineDriver, DeclineExplanation, DeclineTreeNode } from '../../types/api'
import { displayName } from '../../utils/displayNames'

// Renders explain_decline()'s real, computed drill-down -- every number here came straight
// from the backend (forecasting_core.explain_decline), never invented by the LLM, which only
// wrote decline.answer_text / decline.recommendation.

function fmt(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function pct(n?: number | null) {
  if (n == null) return '—'
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
}

function trendColor(n?: number | null) {
  if (n == null) return 'text-slate-500 dark:text-slate-400'
  return n >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
}

// The only 3 real values DeclineTreeNode.dimension ever takes (see DECLINE_DRILL_DIMENSIONS in
// forecasting_core.py) -- naive "+s" gets "product" right but mangles "branch" -> "branchs" and
// "category" -> "categorys", so this is a lookup, not a suffix rule.
const DIMENSION_PLURAL: Record<string, string> = { branch: 'branches', category: 'categories', product: 'products' }
function pluralizeDim(dimension: string) {
  return DIMENSION_PLURAL[dimension] ?? `${dimension}s`
}

// Every list here is SELECTED by real ₹ impact (see forecasting_core._decline_breakdown --
// deliberately not by %, since a product up 90% on ₹500 barely matters next to a branch up 8%
// on ₹8M). But the number a reader's eye actually lands on, first, is the % shown beside each
// row -- so a ₹-ranked list reads as "out of order" even though the selection itself is sound.
// This re-sorts only the DISPLAY order (never which items were picked) by the size of that %,
// so what's on screen reads top-to-bottom exactly the way it's sorted.
function byPctMagnitude<T extends { delta_pct?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => Math.abs(b.delta_pct ?? 0) - Math.abs(a.delta_pct ?? 0))
}

// The FULL breakdown table (every value at a scope, not just the top 3 movers) sorts by the
// actual signed % change -- biggest gains at the top, biggest declines at the bottom -- the
// standard convention for a data table, so growth and decline read as two separate, ordered
// groups instead of interleaved by size. Deliberately a different sort than byPctMagnitude
// above: the top-3 mover cards want the single most DRAMATIC change regardless of direction (a
// product that collapsed 90% is exactly as newsworthy as one that grew 90%), but a full
// reference table of every value reads better grouped by direction, not just by size.
function bySignedPct<T extends { delta_pct?: number | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.delta_pct ?? 0) - (a.delta_pct ?? 0))
}

// The LLM's own OUTPUT FORMAT is constrained to short plain sentences with no markdown -- so a
// sentence boundary is reliably "a period after a lowercase/%/) char, then whitespace, then a
// capital letter". Splitting on that turns one dense paragraph into scannable bullets without
// touching the backend, and every figure gets bolded so the numbers -- not the prose -- are
// what a client's eye lands on.
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[a-z%)])\.\s+(?=[A-Z])/g)
    .map((s) => s.trim().replace(/\.$/, ''))
    .filter(Boolean)
}

const NUMBER_RE = /[+-]?\d[\d,]*\.?\d*%?/g

function withBoldNumbers(sentence: string) {
  const nodes: (string | JSX.Element)[] = []
  let lastIndex = 0
  for (const match of sentence.matchAll(NUMBER_RE)) {
    const idx = match.index ?? 0
    if (idx > lastIndex) nodes.push(sentence.slice(lastIndex, idx))
    nodes.push(
      <strong key={idx} className="font-extrabold text-slate-900 dark:text-slate-50">
        {match[0]}
      </strong>,
    )
    lastIndex = idx + match[0].length
  }
  if (lastIndex < sentence.length) nodes.push(sentence.slice(lastIndex))
  return nodes
}

const DIRECTION_BG: Record<DeclineExplanation['direction'], string> = {
  decrease: 'from-red-500 to-rose-600',
  increase: 'from-emerald-500 to-teal-600',
  flat: 'from-slate-500 to-slate-600',
}

// Each drill-down depth gets its own accent so nesting reads through color, not just
// indentation -- branch/category/product (or whichever 1-3 dimensions apply) each get a
// visually distinct family.
const LEVEL_THEME = [
  {
    border: 'border-primary-200 dark:border-primary-800/60',
    bg: 'bg-primary-50/70 dark:bg-primary-950/30',
    chip: 'bg-primary-600',
    label: 'text-primary-700 dark:text-primary-300',
  },
  {
    border: 'border-accent-200 dark:border-accent-800/60',
    bg: 'bg-accent-50/70 dark:bg-accent-950/30',
    chip: 'bg-accent-600',
    label: 'text-accent-700 dark:text-accent-300',
  },
  {
    border: 'border-amber-200 dark:border-amber-800/60',
    bg: 'bg-amber-50/70 dark:bg-amber-950/30',
    chip: 'bg-amber-500',
    label: 'text-amber-700 dark:text-amber-300',
  },
]

// Shared by the root-level fork and every nested TreeNodeCard -- one collapsible table of
// EVERY real value at a scope, not just the top 3 kept in the tree above it. Only rendered
// once per fork (sourced from one representative sibling's all_values, since real siblings
// under the same parent share an identical breakdown) rather than once per card, so a branch
// with 3 categories doesn't repeat the same "full category breakdown" 3 times over.
function FullBreakdownDetails({
  dimension,
  rows,
  labelClass = 'text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400',
}: {
  dimension: string
  rows: DeclineBreakdownRow[]
  labelClass?: string
}) {
  if (rows.length === 0) return null
  return (
    <details className="mt-3">
      <summary className={`cursor-pointer text-xs font-bold ${labelClass} hover:underline`}>
        Full {dimension} breakdown ({rows.length} values)
      </summary>
      <div className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
            <tr className="text-left text-slate-500 dark:text-slate-400">
              <th className="px-2 py-1.5 font-semibold">{dimension}</th>
              <th className="px-2 py-1.5 font-semibold">Change</th>
              <th className="px-2 py-1.5 font-semibold">%</th>
            </tr>
          </thead>
          <tbody>
            {bySignedPct(rows).map((row) => (
              <tr key={row.value} className="border-t border-slate-100 dark:border-slate-800">
                <td className="px-2 py-1.5 text-slate-700 dark:text-slate-300">{displayName(dimension, row.value)}</td>
                <td className="tabular-figure px-2 py-1.5 text-slate-600 dark:text-slate-400">
                  {fmt(row.comparison)} → {fmt(row.target)}
                </td>
                <td className={`tabular-figure px-2 py-1.5 font-bold ${trendColor(row.delta_pct)}`}>{pct(row.delta_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function primaryDriverNote(driver?: DeclineDriver | null) {
  if (!driver?.primary_driver) return null
  const key = driver.primary_driver
  return { icon: DRIVER_ICONS[key], label: DRIVER_LABELS[key], pct: pct(driver[key].delta_pct) }
}

// The bottom of a fork -- a real value with no further dimension to drill into (e.g. a
// product, or whatever the deepest requested dimension was). Rendered as a compact row, not a
// full card, since up to 27 of these can be on screen together (3 branches x 3 categories x 3
// products) and each one still needs to stay individually readable.
function ProductLeaf({ node, theme }: { node: DeclineTreeNode; theme: (typeof LEVEL_THEME)[number] }) {
  const note = primaryDriverNote(node.driver)
  return (
    <div className={`rounded-xl border ${theme.border} ${theme.bg} px-3 py-2`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-200" title={displayName(node.dimension, node.value)}>
          {displayName(node.dimension, node.value)}
        </span>
        <span className={`tabular-figure shrink-0 text-[13px] font-extrabold ${trendColor(node.delta_pct)}`}>{pct(node.delta_pct)}</span>
      </div>
      <p className="tabular-figure mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        {fmt(node.comparison)} → {fmt(node.target)}
      </p>
      {note && (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {note.icon} <span className="font-semibold">{note.label}</span> moved most ({note.pct})
        </p>
      )}
    </div>
  )
}

// One fork of the fan-out tree -- a branch, or a category nested inside one. Recurses into its
// own children: each child renders as another TreeNodeCard if IT has children of its own
// (category, nested inside a branch card), or as a compact ProductLeaf row if it's the bottom
// of the hierarchy (product, nested inside a category card). Depth only picks the color family
// -- the card-vs-leaf shape is decided purely by whether a node has children, so this same
// component correctly renders both the usual 3-deep (branch/category/product) tree and the
// 2-deep tree produced when the question already scoped to one of those three dimensions.
function TreeNodeCard({ node, depth }: { node: DeclineTreeNode; depth: number }) {
  const theme = LEVEL_THEME[depth % LEVEL_THEME.length]
  const childTheme = LEVEL_THEME[(depth + 1) % LEVEL_THEME.length]
  const childDimension = node.children[0]?.dimension
  const childAllValues = node.children[0]?.all_values ?? []

  return (
    <div className={`flex h-full flex-col rounded-2xl border-2 ${theme.border} ${theme.bg} p-4`}>
      <div className="flex flex-wrap items-start gap-2">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${theme.chip} text-xs font-bold text-white`}>
          {depth + 1}
        </span>
        <span>
          <span className={`block text-[10px] font-bold uppercase tracking-wide ${theme.label}`}>{node.dimension}</span>
          <span className="text-[15px] font-bold leading-tight text-slate-900 dark:text-slate-50">
            {displayName(node.dimension, node.value)}
          </span>
        </span>
        <span
          className={`ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
            node.concentrated ? `${theme.chip} text-white` : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
          }`}
        >
          {node.concentrated ? '★ Dominant' : 'Spread'}
        </span>
      </div>

      <div className="tabular-figure mt-2 flex flex-wrap items-baseline gap-x-2 text-lg">
        <span className="text-slate-500 dark:text-slate-400">{fmt(node.comparison)}</span>
        <span className="text-slate-400">→</span>
        <span className="font-extrabold text-slate-900 dark:text-slate-50">{fmt(node.target)}</span>
        <span className={`text-base font-extrabold ${trendColor(node.delta_pct)}`}>({pct(node.delta_pct)})</span>
      </div>
      <p className={`mt-1 text-xs font-bold ${theme.label}`}>
        {node.share_of_parent_decline_pct.toFixed(1)}% of the movement at this level
      </p>
      {node.offset_note && <p className="mt-1 text-[11px] italic text-slate-500 dark:text-slate-400">Note: {node.offset_note}</p>}

      {node.children.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Top {node.children.length} {childDimension && pluralizeDim(childDimension)} inside this {node.dimension}
          </p>
          <div className="space-y-2">
            {byPctMagnitude(node.children).map((child) =>
              child.children.length > 0 ? (
                <TreeNodeCard key={`${child.dimension}-${child.value}`} node={child} depth={depth + 1} />
              ) : (
                <ProductLeaf key={`${child.dimension}-${child.value}`} node={child} theme={childTheme} />
              ),
            )}
          </div>
        </div>
      ) : (
        node.stopped_reason && <p className="mt-3 text-[11px] italic text-slate-500 dark:text-slate-400">Note: {node.stopped_reason}</p>
      )}

      {childDimension && <FullBreakdownDetails dimension={childDimension} rows={childAllValues} labelClass={theme.label} />}
    </div>
  )
}

const DRIVER_LABELS: Record<string, string> = {
  quantity: 'Units sold',
  avg_price: 'Avg. price',
  distinct_customers: 'Distinct customers',
}
const DRIVER_ICONS: Record<string, string> = { quantity: '📦', avg_price: '💵', distinct_customers: '👥' }

export function DeclineExplanationCard({ decline }: { decline: DeclineExplanation }) {
  const { total, driver } = decline
  const scope = decline.scope_value
    ? `${decline.scope_dimension} = ${displayName(decline.scope_dimension, decline.scope_value)}`
    : 'Whole business'
  const up = total.delta_pct != null && total.delta_pct >= 0

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[var(--shadow-card)] dark:border-slate-800 dark:bg-slate-900">
      {/* Bold gradient header band */}
      <div className={`bg-gradient-to-br ${DIRECTION_BG[decline.direction]} px-6 py-5 text-white`}>
        <p className="text-xs font-bold uppercase tracking-widest text-white/80">{scope}</p>
        <h3 className="mt-1 text-2xl font-bold capitalize">Why {decline.metric_label} changed</h3>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">
              {decline.comparison_year} → {decline.target_year}
            </p>
            <p className="tabular-figure mt-0.5 text-xl font-semibold">
              {fmt(total.comparison)} → {fmt(total.target)}
            </p>
          </div>
          <p className="text-4xl font-extrabold leading-none">
            {up ? '↑' : '↓'} {pct(total.delta_pct)}
          </p>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {decline.horizon_note && (
          <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
            ⚠️ {decline.horizon_note}
          </div>
        )}

        {decline.tree.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
              {decline.direction === 'decrease' ? 'Where the decline is coming from' : 'Where the growth is coming from'}
            </p>
            <p className="max-w-3xl text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              Not just the single biggest mover — the top 3 {pluralizeDim(decline.tree[0].dimension)}, and inside{' '}
              <b className="text-slate-800 dark:text-slate-200">each one</b> of those, its own top 3{' '}
              {decline.tree[0].children[0]?.dimension ? pluralizeDim(decline.tree[0].children[0].dimension) : 'next level'}
              {decline.tree[0].children[0]?.children[0] && (
                <>
                  , and inside <b className="text-slate-800 dark:text-slate-200">each of those</b>, its own top 3{' '}
                  {pluralizeDim(decline.tree[0].children[0].children[0].dimension)}
                </>
              )}
              . Every number below is real, computed straight from recorded transactions — nothing here is guessed.
            </p>

            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
              {byPctMagnitude(decline.tree).map((node) => (
                <TreeNodeCard key={`${node.dimension}-${node.value}`} node={node} depth={0} />
              ))}
            </div>

            <FullBreakdownDetails dimension={decline.tree[0].dimension} rows={decline.tree[0].all_values} />
          </div>
        )}

        {decline.stopped_reason && (
          <p className="text-xs italic text-slate-500 dark:text-slate-400">Note: {decline.stopped_reason}</p>
        )}

        {decline.recommendation && (
          <div className="rounded-2xl border-2 border-accent-300 bg-gradient-to-br from-accent-100 to-accent-50 p-5 dark:border-accent-700 dark:from-accent-950/60 dark:to-accent-900/30">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-600 text-base">
                💡
              </span>
              <p className="text-sm font-extrabold uppercase tracking-wide text-accent-800 dark:text-accent-200">
                Recommended next step
              </p>
            </div>
            <p className="mt-3 text-base font-medium leading-relaxed text-accent-950 dark:text-accent-50">
              {decline.recommendation}
            </p>
          </div>
        )}

        <details className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-950">
          <summary className="cursor-pointer text-sm font-bold uppercase tracking-widest text-slate-500 hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400">
            Read the full explanation
          </summary>
          <ul className="mt-4 space-y-3">
            {splitSentences(decline.answer_text).map((sentence, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />
                <span className="text-lg leading-relaxed text-slate-800 dark:text-slate-200">
                  {withBoldNumbers(sentence)}
                </span>
              </li>
            ))}
          </ul>
        </details>

        {driver && (
          <div className="rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 to-white p-5 dark:border-primary-800 dark:from-primary-950/40 dark:to-slate-900">
            <p className="text-xs font-bold uppercase tracking-widest text-primary-700 dark:text-primary-300">
              What drove the deepest-level change
            </p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(['quantity', 'avg_price', 'distinct_customers'] as const).map((key) => {
                const f = driver[key]
                const isPrimary = driver.primary_driver === key
                return (
                  <div
                    key={key}
                    className={`rounded-xl border-2 p-3.5 ${
                      isPrimary
                        ? 'border-primary-500 bg-white shadow-md dark:border-primary-400 dark:bg-slate-900'
                        : 'border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                        {DRIVER_ICONS[key]} {DRIVER_LABELS[key]}
                      </span>
                      {isPrimary && (
                        <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[9px] font-extrabold uppercase text-white">
                          Primary
                        </span>
                      )}
                    </div>
                    <p className={`tabular-figure mt-1.5 text-2xl font-extrabold ${trendColor(f.delta_pct)}`}>
                      {pct(f.delta_pct)}
                    </p>
                    <p className="tabular-figure text-xs font-medium text-slate-500 dark:text-slate-400">
                      {f.comparison != null ? fmt(f.comparison) : '—'} → {f.target != null ? fmt(f.target) : '—'}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
