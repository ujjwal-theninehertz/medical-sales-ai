import { useCallback, useEffect, useState } from 'react'

// index.html's inline pre-paint script already applied the initial .dark class (localStorage,
// falling back to OS preference) -- this hook just reads that starting state and gives the
// rest of the app a way to toggle + persist it, without a flash on load.
export function useTheme() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
    try {
      localStorage.setItem('theme', isDark ? 'dark' : 'light')
    } catch {
      // Private browsing / storage blocked -- theme still works for this page load, just
      // won't persist across visits.
    }
  }, [isDark])

  const toggle = useCallback(() => setIsDark((v) => !v), [])

  return { isDark, toggle }
}
