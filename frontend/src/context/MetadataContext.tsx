import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ApiError, getMetadata } from '../api/client'
import type { MetadataResponse } from '../types/api'

interface MetadataState {
  data: MetadataResponse | null
  loading: boolean
  error: string | null
}

const MetadataContext = createContext<MetadataState | undefined>(undefined)

export function MetadataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MetadataState>({ data: null, loading: true, error: null })

  useEffect(() => {
    let cancelled = false
    getMetadata()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : 'Failed to load app configuration.'
        setState({ data: null, loading: false, error: message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return <MetadataContext.Provider value={state}>{children}</MetadataContext.Provider>
}

export function useMetadata(): MetadataState {
  const ctx = useContext(MetadataContext)
  if (!ctx) throw new Error('useMetadata must be used within a MetadataProvider')
  return ctx
}
