// The single source of truth for what pages exist, in what order, under which sidebar group.
// The sidebar and the page router in App.tsx both read this one list -- adding a page means
// adding one entry here plus its component in the PAGES map.
//
// Order follows the client presentation narrative, not when a page was built: the data first
// (what this is built on), then the models (how a prediction is actually made), then the live
// project overview, then how a user actually drives it. Everything else is real supporting
// detail, not filler, but it's reference material a presenter drops into only if asked -- so it
// sits after the four-page walkthrough rather than interrupting it.

export interface PageDef {
  id: string
  label: string
  group: 'flow' | 'detail'
  /** One line shown under the title at the top of the page and in the sidebar tooltip. */
  blurb: string
}

export const PAGES: PageDef[] = [
  { id: 'data-history', label: 'The Data', group: 'flow', blurb: 'What the platform is built on, before any prediction' },
  { id: 'solution', label: 'Business Insights', group: 'flow', blurb: 'The problem, and how we solve it' },
  { id: 'model-lab', label: 'AI Native Solution', group: 'flow', blurb: 'Which model, and why' },
  { id: 'overview', label: 'Project Overview', group: 'flow', blurb: 'Current status across every scope and grain' },
  { id: 'workflow', label: 'End-to-End Workflow', group: 'flow', blurb: 'Question to answer, stage by stage' },

  { id: 'user-flow', label: 'User Flow', group: 'detail', blurb: 'How a question becomes an answer' },
  { id: 'brief', label: 'The Business Case', group: 'detail', blurb: 'Problem, objective, approach' },
  { id: 'models-tested', label: 'Models Tested', group: 'detail', blurb: 'Six candidates, one real holdout' },
  { id: 'accuracy', label: 'Actual vs Predicted', group: 'detail', blurb: 'What we forecast, what happened' },
  { id: 'features', label: 'Features Delivered', group: 'detail', blurb: 'Everything shipped in this project' },
  { id: 'deep-dive', label: 'Deep-Dive Intelligence', group: 'detail', blurb: 'Why sales moved, traced to a product' },
]

export const GROUP_LABELS: Record<PageDef['group'], string> = {
  flow: 'The Presentation',
  detail: 'More Detail',
}

export function pageIndex(id: string): number {
  return PAGES.findIndex((p) => p.id === id)
}

export function pageNumber(id: string): string {
  return String(pageIndex(id) + 1).padStart(2, '0')
}
