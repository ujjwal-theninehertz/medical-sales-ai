import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useMetadata } from '../context/MetadataContext'
import { displayName } from '../utils/displayNames'

// Provided by the client for this page's download link -- used verbatim, not re-derived.
const EXCEL_URL =
  'https://theninehertzindia-my.sharepoint.com/:x:/g/personal/ujjawal_t_theninehertz_com/IQBDV9J4NflOSKPVOiUavTwNAZXXL-IXJtE0rQzm-G0QIds?e=qzbZbG'

function CountUp({ value, duration = 1.1 }: { value: number; duration?: number }) {
  const motionVal = useMotionValue(0)
  const display = useTransform(motionVal, (v) => Math.round(v).toLocaleString())
  useEffect(() => {
    const controls = animate(motionVal, value, { duration, ease: 'easeOut' })
    return controls.stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return <motion.span>{display}</motion.span>
}

interface TileTheme {
  bg: string
  border: string
  text: string
  chip: string
  ring: string
}

interface Tile {
  key: string
  label: string
  icon: string
  value: number
  /** The real values behind this tile's count, for the click-through modal -- null when the
   *  data genuinely has no meaningful list to show (anonymized customer IDs), never faked. */
  names: string[] | null
  note?: string
  theme: TileTheme
}

const TILE_THEME: TileTheme[] = [
  { bg: 'bg-primary-50 dark:bg-primary-950/40', border: 'border-primary-200 dark:border-primary-800', text: 'text-primary-700 dark:text-primary-300', chip: 'bg-primary-100 dark:bg-primary-900/50', ring: 'hover:border-primary-300 dark:hover:border-primary-700' },
  { bg: 'bg-accent-50 dark:bg-accent-950/40', border: 'border-accent-200 dark:border-accent-800', text: 'text-accent-700 dark:text-accent-300', chip: 'bg-accent-100 dark:bg-accent-900/50', ring: 'hover:border-accent-300 dark:hover:border-accent-700' },
  { bg: 'bg-violet-50 dark:bg-violet-950/40', border: 'border-violet-200 dark:border-violet-800', text: 'text-violet-700 dark:text-violet-300', chip: 'bg-violet-100 dark:bg-violet-900/50', ring: 'hover:border-violet-300 dark:hover:border-violet-700' },
  { bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-300', chip: 'bg-orange-100 dark:bg-orange-900/50', ring: 'hover:border-orange-300 dark:hover:border-orange-700' },
  { bg: 'bg-cyan-50 dark:bg-cyan-950/40', border: 'border-cyan-200 dark:border-cyan-800', text: 'text-cyan-700 dark:text-cyan-300', chip: 'bg-cyan-100 dark:bg-cyan-900/50', ring: 'hover:border-cyan-300 dark:hover:border-cyan-700' },
  { bg: 'bg-rose-50 dark:bg-rose-950/40', border: 'border-rose-200 dark:border-rose-800', text: 'text-rose-700 dark:text-rose-300', chip: 'bg-rose-100 dark:bg-rose-900/50', ring: 'hover:border-rose-300 dark:hover:border-rose-700' },
  { bg: 'bg-amber-50 dark:bg-amber-950/40', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-700 dark:text-amber-300', chip: 'bg-amber-100 dark:bg-amber-900/50', ring: 'hover:border-amber-300 dark:hover:border-amber-700' },
  { bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-800', text: 'text-emerald-700 dark:text-emerald-300', chip: 'bg-emerald-100 dark:bg-emerald-900/50', ring: 'hover:border-emerald-300 dark:hover:border-emerald-700' },
  { bg: 'bg-sky-50 dark:bg-sky-950/40', border: 'border-sky-200 dark:border-sky-800', text: 'text-sky-700 dark:text-sky-300', chip: 'bg-sky-100 dark:bg-sky-900/50', ring: 'hover:border-sky-300 dark:hover:border-sky-700' },
  { bg: 'bg-fuchsia-50 dark:bg-fuchsia-950/40', border: 'border-fuchsia-200 dark:border-fuchsia-800', text: 'text-fuchsia-700 dark:text-fuchsia-300', chip: 'bg-fuchsia-100 dark:bg-fuchsia-900/50', ring: 'hover:border-fuchsia-300 dark:hover:border-fuchsia-700' },
  { bg: 'bg-lime-50 dark:bg-lime-950/40', border: 'border-lime-200 dark:border-lime-800', text: 'text-lime-700 dark:text-lime-300', chip: 'bg-lime-100 dark:bg-lime-900/50', ring: 'hover:border-lime-300 dark:hover:border-lime-700' },
]

// Real-world categories get a matching icon per value; enumerated instances (branches, routes,
// products...) fall back to the tile's own icon since "Medical Branch 07" has no distinct
// identity of its own to illustrate.
const VALUE_ICON: Record<string, Record<string, string>> = {
  customer_type: { Clinic: '🏥', Distributor: '📦', Government: '🏛️', Hospital: '🏨', Pharmacy: '💊' },
  product_type: {
    Capsule: '💊',
    Injection: '💉',
    'Medical Device': '🩺',
    OTC: '🛒',
    'Surgical Supply': '🔪',
    Syrup: '🧴',
    Tablet: '⚪',
  },
  payment_method: { 'Bank Transfer': '🏦', Cash: '💵', Credit: '💳', Debit: '🏧', Invoice: '🧾' },
  sales_status: { Completed: '✅', Cancelled: '❌', Returned: '↩️' },
  offer: { Yes: '🎉', No: '🚫' },
}

function itemIcon(tile: Tile, name: string): string {
  return VALUE_ICON[tile.key]?.[name] ?? tile.icon
}

function TileModal({ tile, onClose }: { tile: Tile; onClose: () => void }) {
  const [filter, setFilter] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  const shown = filter.trim()
    ? (tile.names ?? []).filter((n) => n.toLowerCase().includes(filter.trim().toLowerCase()))
    : (tile.names ?? [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.18 }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div className={`relative overflow-hidden border-b border-slate-100 p-5 dark:border-slate-800 ${tile.theme.bg}`}>
          <span
            aria-hidden
            className={`pointer-events-none absolute -right-6 -top-6 text-8xl opacity-10 ${tile.theme.text}`}
          >
            {tile.icon}
          </span>
          <div className="relative flex items-center gap-3">
            <span
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm ${tile.theme.chip}`}
            >
              {tile.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-extrabold text-slate-900 dark:text-slate-50">{tile.label}</p>
              <p className={`tabular-figure text-xs font-bold uppercase tracking-wide ${tile.theme.text}`}>
                {tile.value.toLocaleString()} total
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/70 text-slate-500 transition hover:bg-white hover:text-slate-800 dark:bg-slate-900/50 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
            >
              ✕
            </button>
          </div>
        </div>
        {tile.names && tile.names.length > 8 && (
          <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={`Search ${tile.value.toLocaleString()} ${tile.label.toLowerCase()}…`}
              className="w-full rounded-xl border-2 border-slate-200 bg-slate-50 px-3.5 py-2 text-sm font-medium text-slate-700 outline-none transition focus:border-primary-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:bg-slate-900"
            />
          </div>
        )}
        <div className="overflow-y-auto p-3">
          {tile.names ? (
            shown.length > 0 ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {shown.map((n, i) => (
                  <motion.div
                    key={n}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i, 20) * 0.015 }}
                    className={`group flex items-center gap-3 rounded-xl border-2 border-transparent bg-slate-50 px-3 py-2.5 transition dark:bg-slate-800/50 ${tile.theme.ring} hover:bg-white hover:shadow-sm dark:hover:bg-slate-800`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base ${tile.theme.chip}`}
                    >
                      {itemIcon(tile, n)}
                    </span>
                    <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{n}</span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <p className="px-3 py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                No match for "{filter}".
              </p>
            )
          ) : (
            <div className="flex items-start gap-3 p-3">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg ${tile.theme.chip}`}>
                ℹ️
              </span>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">{tile.note}</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

export function DataHistoryPage() {
  const { data } = useMetadata()
  const ov = data?.dataset_overview
  const [openTile, setOpenTile] = useState<Tile | null>(null)

  const dimensionTiles: Tile[] = ov
    ? [
        {
          key: 'supplier',
          label: 'Suppliers',
          icon: '🚚',
          names: data?.dimension_values.supplier?.map((v) => displayName('supplier', v)) ?? null,
        },
        {
          key: 'branch',
          label: 'Branches',
          icon: '🏬',
          names: data?.dimension_values.branch?.map((v) => displayName('branch', v)) ?? null,
        },
        { key: 'category', label: 'Categories', icon: '🗂️', names: data?.dimension_values.category ?? null },
        { key: 'product_type', label: 'Product Types', icon: '🏷️', names: data?.dimension_values.product_type ?? null },
        {
          key: 'product',
          label: 'Products',
          icon: '💊',
          names: data?.dimension_values.product?.map((v) => displayName('product', v)) ?? null,
        },
        {
          key: 'route',
          label: 'Routes',
          icon: '🛣️',
          names: data?.dimension_values.route?.map((v) => displayName('route', v)) ?? null,
        },
        {
          key: 'customer_type',
          label: 'Customer Types',
          icon: '🧑\u200d🤝\u200d🧑',
          names: data?.dimension_values.customer_type ?? null,
        },
        {
          key: 'customer',
          label: 'Customers',
          icon: '👤',
          names: null,
          note:
            '500 individual customers are tracked by ID. They roll up into the 5 customer types shown separately.',
        },
        {
          key: 'payment_method',
          label: 'Payment Methods',
          icon: '💳',
          names: ov.categorical_fields.payment_method ?? null,
        },
      ].map((t, i) => ({
        ...t,
        value: ov.counts[t.key] ?? t.names?.length ?? 0,
        theme: TILE_THEME[i % TILE_THEME.length],
      }))
    : []


  return (
    <div>
      {/* ---------- hero ---------- */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary-700 via-primary-600 to-accent-600 p-6 text-white shadow-xl sm:p-10"
      >
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-accent-300/30 blur-3xl"
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.span
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-primary-300/25 blur-3xl"
          animate={{ scale: [1, 1.1, 1], opacity: [0.4, 0.65, 0.4] }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
        />

        <div className="relative max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/70">The Presentation</p>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-1.5 text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl"
          >
            Five years of history of Medical Data.{' '}
            <span className="bg-gradient-to-r from-amber-200 via-white to-accent-100 bg-clip-text text-transparent">
              Zero forward view — until now.
            </span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 text-[15px] leading-relaxed text-white/85 sm:text-base"
          >
            Over the last five years, this business has recorded more than{' '}
            <b className="font-extrabold text-white">250,000 real transactions</b> — every branch,
            every route, every product. But all that history could only ever tell you what already
            happened. Planning ran on gut feel and last year's shape, and any "why did sales move"
            question meant someone manually digging through spreadsheets with no real answer at the
            end of it. What we've built turns that same history into a system you can just{' '}
            <b className="font-extrabold text-white">ask </b> — what next month's
            revenue will be, why a category moved the way it did, what a specific branch is likely
            to do next. And it{' '}
            <b className="font-extrabold text-amber-200">never guesses</b>: every number you'll see
            comes from a model that's already proven itself against real, held-back data, with its
            actual error rate shown right next to it — if nothing can answer reliably, it says so
            instead of faking confidence.
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="mt-3 text-[15px] font-bold text-white sm:text-base"
          >
            This walkthrough covers five stops: the data it's built on, the problem it solves, the
            models competing over it, where the project stands today, and exactly how one question
            becomes an answer.
          </motion.p>
        </div>
      </motion.div>

      {/* ---------- dimension tiles ---------- */}
      <div className="mt-8">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-accent-600 dark:text-accent-400">
          Every dimension covered
        </p>
        <h2 className="mt-1 text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          How the business is sliced
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tap any tile to see the real values behind it.</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {(ov ? dimensionTiles : Array.from<undefined>({ length: 9 })).map((d, i) => {
          const theme = d?.theme ?? TILE_THEME[i % TILE_THEME.length]
          return (
            <motion.button
              key={d ? d.key : i}
              type="button"
              onClick={() => d && setOpenTile(d)}
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ y: -3 }}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.25, delay: i * 0.04 }}
              className={`group relative overflow-hidden rounded-2xl border-2 p-4 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-card-hover)] ${
                d ? `${theme.bg} ${theme.border}` : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              {d ? (
                <>
                  <span aria-hidden className="text-2xl">
                    {d.icon}
                  </span>
                  <p className={`tabular-figure mt-2 text-3xl font-extrabold ${theme.text}`}>
                    <CountUp value={d.value} />
                  </p>
                  <p className="mt-0.5 text-sm font-semibold text-slate-600 dark:text-slate-400">{d.label}</p>
                  <span
                    className={`absolute bottom-2.5 right-3 text-[10px] font-bold uppercase tracking-wide opacity-0 transition-opacity group-hover:opacity-70 ${theme.text}`}
                  >
                    View names →
                  </span>
                </>
              ) : (
                <div className="h-20 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              )}
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>{openTile && <TileModal tile={openTile} onClose={() => setOpenTile(null)} />}</AnimatePresence>

      {/* ---------- footer CTA ---------- */}
      <div className="mt-8 rounded-3xl border-2 border-dashed border-slate-300 bg-white p-6 text-center shadow-[var(--shadow-card)] dark:border-slate-700 dark:bg-slate-900 sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">Raw data</p>
        <h3 className="mt-1.5 text-xl font-extrabold text-slate-900 dark:text-slate-50 sm:text-2xl">
          Want to inspect it yourself?
        </h3>
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-500 dark:text-slate-400">
          The complete, unfiltered dataset behind every figure in this app, with the same names
          shown on screen throughout.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <motion.a
            href={EXCEL_URL}
            target="_blank"
            rel="noopener noreferrer"
            whileHover={{ scale: 1.035, y: -2 }}
            whileTap={{ scale: 0.98 }}
            className="inline-flex items-center gap-2.5 rounded-2xl bg-gradient-to-br from-primary-600 to-accent-600 px-7 py-3.5 text-base font-bold text-white shadow-lg shadow-primary-600/25 transition hover:shadow-xl hover:shadow-primary-600/30"
          >
            <span aria-hidden className="text-xl">
              📄
            </span>
            View / Download Excel Data
          </motion.a>
          <button
            type="button"
            onClick={() => {
              window.location.hash = 'solution'
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            className="inline-flex items-center gap-2 rounded-2xl border-2 border-slate-300 px-6 py-3.5 text-base font-bold text-slate-700 transition hover:border-primary-400 hover:text-primary-700 dark:border-slate-600 dark:text-slate-200 dark:hover:border-primary-500 dark:hover:text-primary-300"
          >
            Continue to The Approach →
          </button>
        </div>
      </div>
    </div>
  )
}
