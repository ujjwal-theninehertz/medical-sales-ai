// Mirrors app.py's exact formatting (lines 430-434): freq="W" -> "week of %b %d, %Y",
// else -> "%B %Y". A year-only target overrides both with "Full year YYYY".

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** calendar.month_name[n] equivalent -- n is 1-12. */
export function monthName(n: number): string {
  return MONTHS_LONG[n - 1]
}

function formatPeriod(isoDate: string, freq: 'W' | 'MS'): string {
  const d = new Date(isoDate + 'T00:00:00')
  if (freq === 'W') {
    return `week of ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
  }
  return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`
}

export function formatTargetLabel(targetPeriod: string, freq: 'W' | 'MS', yearOnly: boolean): string {
  if (yearOnly) {
    return `Full year ${new Date(targetPeriod + 'T00:00:00').getFullYear()}`
  }
  return formatPeriod(targetPeriod, freq)
}

export function formatHistoryEnd(historyEnd: string, freq: 'W' | 'MS'): string {
  return formatPeriod(historyEnd, freq)
}
