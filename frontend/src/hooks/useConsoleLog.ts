import { useEffect } from 'react'

/**
 * Direct replacement for app.py's push_to_browser_console(). Streamlit ran entirely
 * server-side, so it had to inject a real <script> tag (via components.html -- st.markdown's
 * unsafe_allow_html doesn't reliably execute scripts) just to get print()-equivalent lines
 * into the browser's own DevTools console. React already runs in the browser -- this is the
 * whole workaround, reduced to what it always should have been.
 */
export function useConsoleLog(lines: string[] | undefined) {
  useEffect(() => {
    if (!lines || lines.length === 0) return
    console.log('[Medical Sales Assistant] steps:')
    lines.forEach((l) => console.log('  ' + l))
  }, [lines])
}
