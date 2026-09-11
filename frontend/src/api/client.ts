import type {
  AskRequest,
  AskResponse,
  BacktestsResponse,
  DashboardFilters,
  DashboardSummary,
  DeclineExplanation,
  MetadataResponse,
  PlaygroundRequest,
  PlaygroundResponse,
  ScopeMatrix,
} from '../types/api'

// An EMPTY VITE_API_BASE_URL is meaningful, not missing: it means "same origin". That is how
// this is deployed -- one reverse proxy serves the built frontend and forwards /api/* to the
// backend from the same host and port, so no CORS config is needed anywhere. Every path passed
// to request() below already starts with /api, so '' yields a correct relative URL and the app
// keeps working unchanged if the server's address ever changes. Only a genuinely undefined var
// (never declared at build time) is an error, so the loud-failure behavior below is preserved
// for the case it was actually written for.
const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL as string | undefined

if (RAW_BASE_URL === undefined) {
  // Fails loudly at import time rather than producing confusing "Failed to fetch" errors
  // scattered across every call site -- one clear message, one place.
  throw new Error('VITE_API_BASE_URL is not set. Check frontend/.env.')
}

const BASE_URL = RAW_BASE_URL

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { 'Content-Type': 'application/json' },
      ...init,
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the backend running?')
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = body.detail ?? detail
    } catch {
      // response wasn't JSON -- keep statusText
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export function getMetadata(): Promise<MetadataResponse> {
  return request<MetadataResponse>('/api/metadata')
}

export function askQuestion(question: string): Promise<AskResponse> {
  const body: AskRequest = { question }
  return request<AskResponse>('/api/ask', { method: 'POST', body: JSON.stringify(body) })
}

export function runPlayground(params: PlaygroundRequest): Promise<PlaygroundResponse> {
  return request<PlaygroundResponse>('/api/playground/run', {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

function filterParams(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams()
  params.set('metric', filters.metric)
  if (filters.dimension) params.set('dimension', filters.dimension)
  if (filters.dimension_value) params.set('dimension_value', filters.dimension_value)
  if (filters.year) params.set('year', String(filters.year))
  return params
}

export function getDashboardSummary(filters: DashboardFilters): Promise<DashboardSummary> {
  const params = filterParams(filters)
  params.set('grain', filters.grain)
  return request<DashboardSummary>(`/api/dashboard/summary?${params.toString()}`)
}

export function getDashboardInsights(filters: DashboardFilters): Promise<DeclineExplanation> {
  return request<DeclineExplanation>(`/api/dashboard/insights?${filterParams(filters).toString()}`)
}

export function getBacktests(): Promise<BacktestsResponse> {
  return request<BacktestsResponse>('/api/backtests')
}

export function getScopeMatrix(metric: string, grain: string, dimension: string): Promise<ScopeMatrix> {
  const params = new URLSearchParams({ metric, grain, dimension })
  return request<ScopeMatrix>(`/api/dashboard/scopes?${params.toString()}`)
}

/** A direct link (not fetched -- handed to an <a href>) to the full dataset as a CSV, with
 *  branch/route/supplier/product already swapped for their display names, so what a client
 *  downloads matches what the app shows them. */
export function getDatasetExportUrl(): string {
  return `${BASE_URL}/api/dataset-export`
}
