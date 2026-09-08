import { AnimatePresence, motion } from 'framer-motion'
import { useState, type ReactNode } from 'react'
import { Sidebar } from './components/shell/Sidebar'
import { MetadataProvider, useMetadata } from './context/MetadataContext'
import { usePage } from './hooks/usePage'
import { AccuracyPage } from './pages/AccuracyPage'
import { BriefPage } from './pages/BriefPage'
import { DataHistoryPage } from './pages/DataHistoryPage'
import { DeepDivePage } from './pages/DeepDivePage'
import { FeaturesPage } from './pages/FeaturesPage'
import { ModelLabPage } from './pages/ModelLabPage'
import { ModelsTestedPage } from './pages/ModelsTestedPage'
import { OverviewPage } from './pages/OverviewPage'
import { PAGES, pageIndex, pageNumber } from './pages/registry'
import { SolutionPage } from './pages/SolutionPage'
import { UserFlowPage } from './pages/UserFlowPage'
import { WorkflowPage } from './pages/WorkflowPage'

const PAGE_COMPONENTS: Record<string, () => ReactNode> = {
  'data-history': DataHistoryPage,
  solution: SolutionPage,
  overview: OverviewPage,
  'model-lab': ModelLabPage,
  workflow: WorkflowPage,
  brief: BriefPage,
  'models-tested': ModelsTestedPage,
  accuracy: AccuracyPage,
  'user-flow': UserFlowPage,
  features: FeaturesPage,
  'deep-dive': DeepDivePage,
}

function AppShell() {
  const { loading, error } = useMetadata()
  const { page, go } = usePage()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-6 py-16">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 w-full animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900" />
        ))}
      </div>
    )
  }
  if (error) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          Couldn't load the app configuration: {error}. Is the backend running on the URL in
          frontend/.env?
        </div>
      </div>
    )
  }

  const Page = PAGE_COMPONENTS[page] ?? OverviewPage
  const def = PAGES[pageIndex(page)]

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Fixed sidebar on desktop; a slide-over on small screens */}
      <div className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block">
        <Sidebar page={page} onNavigate={go} />
      </div>

      <AnimatePresence>
        {mobileNavOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'tween', duration: 0.2 }}
              className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden"
            >
              <Sidebar
                page={page}
                onNavigate={(id) => {
                  go(id)
                  setMobileNavOpen(false)
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/85 px-4 py-2.5 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85 sm:px-8">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Open navigation"
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-600 lg:hidden dark:border-slate-700 dark:text-slate-300"
          >
            ☰
          </button>
          <p className="tabular-figure text-[11px] font-bold text-slate-400 dark:text-slate-500">
            {pageNumber(page)}
          </p>
          <p className="truncate text-[13px] font-bold text-slate-800 dark:text-slate-200">{def?.label}</p>
          <p className="hidden truncate text-[12px] font-medium text-slate-400 sm:block dark:text-slate-500">
            · {def?.blurb}
          </p>
        </header>

        <main className="px-4 py-8 sm:px-8">
          <div className="mx-auto max-w-[1500px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
              >
                <Page />
              </motion.div>
            </AnimatePresence>

            <footer className="mt-8 pb-4 text-center text-[11px] text-slate-400 dark:text-slate-600">
              Proof of concept · every number shown is computed from real backtests, never invented.
            </footer>
          </div>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <MetadataProvider>
      <AppShell />
    </MetadataProvider>
  )
}
