import { useCallback, useEffect, useState } from 'react'
import { PAGES } from '../pages/registry'

const DEFAULT_PAGE = PAGES[0].id

function fromHash(): string {
  const id = window.location.hash.replace(/^#/, '')
  return PAGES.some((p) => p.id === id) ? id : DEFAULT_PAGE
}

/** Page state kept in the URL hash, so a demo can be deep-linked ("open on the safety page")
 *  and the browser's back button steps through pages. A hash rather than a real route because
 *  it needs no router dependency and no server rewrite rule to work when built and hosted. */
export function usePage() {
  const [page, setPage] = useState(fromHash)

  useEffect(() => {
    const onHashChange = () => setPage(fromHash())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const go = useCallback((id: string) => {
    window.location.hash = id
    setPage(id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  return { page, go }
}
