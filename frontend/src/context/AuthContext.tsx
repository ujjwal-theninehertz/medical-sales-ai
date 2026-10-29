import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { login as apiLogin, setAuthToken, setUnauthorizedHandler } from '../api/client'

interface Session {
  token: string
  username: string
  /** Unix seconds, as issued by the backend. */
  expires_at: number
}

interface AuthState {
  session: Session | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const STORAGE_KEY = 'auth_session'

const AuthContext = createContext<AuthState | undefined>(undefined)

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    return session.expires_at * 1000 > Date.now() ? session : null
  } catch {
    return null
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked -- the session still works for this page load, just won't survive a reload.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => {
    // Set synchronously, not in an effect: children (MetadataProvider) fire their first
    // request in their own effects, which run before this provider's.
    const s = loadSession()
    setAuthToken(s?.token ?? null)
    return s
  })

  const logout = useCallback(() => {
    setAuthToken(null)
    saveSession(null)
    setSession(null)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const s = await apiLogin(username, password)
    setAuthToken(s.token)
    saveSession(s)
    setSession(s)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  // Drop back to the login page the moment the token expires, not on the next failed request.
  useEffect(() => {
    if (!session) return
    const timer = window.setTimeout(logout, Math.max(0, session.expires_at * 1000 - Date.now()))
    return () => window.clearTimeout(timer)
  }, [session, logout])

  return <AuthContext.Provider value={{ session, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
