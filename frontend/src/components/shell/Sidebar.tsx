import { motion } from 'framer-motion'
import { useTheme } from '../../hooks/useTheme'
import { GROUP_LABELS, PAGES, type PageDef } from '../../pages/registry'

function NavItem({
  page,
  num,
  active,
  onClick,
}: {
  page: PageDef
  num: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={page.blurb}
      className={`group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
        active
          ? 'bg-primary-600 font-bold text-white'
          : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
      }`}
    >
      <span
        className={`tabular-figure shrink-0 text-[10px] font-bold ${
          active ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'
        }`}
      >
        {num}
      </span>
      <span className="truncate">{page.label}</span>
    </button>
  )
}

export function Sidebar({ page, onNavigate }: { page: string; onNavigate: (id: string) => void }) {
  const { isDark, toggle } = useTheme()

  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center gap-2.5 border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 text-sm font-extrabold text-white">
          M
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[13px] font-extrabold text-slate-900 dark:text-slate-100">
            Medical Sales AI
          </p>
          <p className="truncate text-[10.5px] font-medium text-slate-500 dark:text-slate-400">
            Forecasting &amp; insights POC
          </p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-4">
        {(['flow', 'detail'] as const).map((group) => (
          <div key={group} className="mb-5">
            <p className="mb-1.5 px-2.5 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500">
              {GROUP_LABELS[group]}
            </p>
            <div className="space-y-0.5">
              {PAGES.filter((p) => p.group === group).map((p) => (
                <NavItem
                  key={p.id}
                  page={p}
                  num={String(PAGES.indexOf(p) + 1).padStart(2, '0')}
                  active={p.id === page}
                  onClick={() => onNavigate(p.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-200 px-3 py-3 dark:border-slate-800">
        <button
          type="button"
          onClick={toggle}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <motion.span
            key={isDark ? 'moon' : 'sun'}
            initial={{ rotate: -90, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ duration: 0.2 }}
            aria-hidden
          >
            {isDark ? '🌙' : '☀️'}
          </motion.span>
          {isDark ? 'Dark' : 'Light'} theme
        </button>
        <p className="mt-2 px-2.5 text-[10px] leading-relaxed text-slate-400 dark:text-slate-600">
          Every number is computed from real backtests — never invented.
        </p>
      </div>
    </aside>
  )
}
