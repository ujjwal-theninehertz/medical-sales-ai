import { motion } from 'framer-motion'
import { useRef, useState, type FormEvent } from 'react'
import { ApiError } from '../api/client'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../hooks/useTheme'

const HIGHLIGHTS = [
  { title: 'Backtested forecasts', body: 'Every model is scored against a real 2025 holdout before it is trusted.' },
  { title: 'Every scope, every grain', body: 'Branch, route, category and product — weekly, monthly and yearly.' },
  { title: 'Ask in plain English', body: 'Questions become forecasts and explanations, with the reasoning shown.' },
]

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" strokeLinecap="round" />}
    </svg>
  )
}

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary-500 focus:ring-4 focus:ring-primary-500/15 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-primary-400'

export function LoginPage() {
  const { login } = useAuth()
  const { isDark, toggle } = useTheme()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    // Read from the form rather than holding the password in React state, so it is never
    // mirrored into a `value` attribute visible in the Elements panel.
    const form = new FormData(e.currentTarget)
    const username = String(form.get('username') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!username || !password) {
      setError('Enter your username and password.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await login(username, password)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? 'Invalid username or password.'
          : err instanceof ApiError
            ? err.message
            : 'Sign-in failed. Please try again.',
      )
      if (passwordRef.current) {
        passwordRef.current.value = ''
        passwordRef.current.focus()
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Brand panel -- desktop only */}
      <div className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-primary-800 via-primary-600 to-accent-600 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(ellipse at 30% 40%, black 20%, transparent 75%)',
          }}
        />
        <div aria-hidden className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent-400/30 blur-3xl" />
        <div aria-hidden className="absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-primary-400/30 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 text-lg font-extrabold text-white ring-1 ring-white/25 backdrop-blur">
            M
          </span>
          <div className="leading-tight">
            <p className="text-base font-extrabold text-white">Medical Sales AI</p>
            <p className="text-xs font-medium text-white/70">Forecasting &amp; insights POC</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative max-w-md"
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-200">Sales intelligence</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight text-white">
            See where sales are heading — before the numbers land.
          </h1>
          <ul className="mt-10 space-y-5">
            {HIGHLIGHTS.map((h, i) => (
              <motion.li
                key={h.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.15 + i * 0.1 }}
                className="flex gap-3.5"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/25">
                  <svg className="h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden>
                    <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div>
                  <p className="text-sm font-bold text-white">{h.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/75">{h.body}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <p className="relative text-xs text-white/60">Every number is computed from real backtests — never invented.</p>
      </div>

      {/* Sign-in form */}
      <div className="relative flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <button
          type="button"
          onClick={toggle}
          aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
          className="absolute right-4 top-4 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm shadow-sm transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800 sm:right-6 sm:top-6"
        >
          {isDark ? '🌙' : '☀️'}
        </button>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-accent-600 font-extrabold text-white">
              M
            </span>
            <div className="leading-tight">
              <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">Medical Sales AI</p>
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Forecasting &amp; insights POC</p>
            </div>
          </div>

          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-600 dark:text-primary-400">
            Secure sign-in
          </p>
          <h2 className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">Welcome back</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Sign in to open the forecasting workspace.</p>

          <form
            onSubmit={onSubmit}
            noValidate
            className="mt-8 space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-[var(--shadow-card)] dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div>
              <label htmlFor="username" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                Username
              </label>
              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" strokeLinecap="round" />
                </svg>
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  autoFocus
                  disabled={submitting}
                  placeholder="Enter your username"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-[13px] font-semibold text-slate-700 dark:text-slate-300">
                Password
              </label>
              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <rect x="4" y="10" width="16" height="11" rx="2" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                </svg>
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={submitting}
                  placeholder="Enter your password"
                  className={`${inputClass} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
            </div>

            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-medium text-red-700 dark:border-red-900 dark:bg-red-950/60 dark:text-red-300"
              >
                {error}
              </motion.div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {submitting && <Spinner />}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Access is limited to authorised Medical Sales team members.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
