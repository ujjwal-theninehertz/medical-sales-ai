// Plain-language documentation for each candidate model: what it actually does to the numbers,
// where that helps, and where it breaks. This is explanatory copy, not data -- the measured
// accuracy for every one of these comes from the backend (/api/backtests, historical_mape).
// Kept deliberately short everywhere -- the popup this feeds is read by a non-technical client
// in a live demo, not studied line by line.

export interface MechanismStep {
  title: string
  text: string
}

export interface ModelDoc {
  label: string
  kind: 'statistical' | 'foundation' | 'llm'
  oneLiner: string
  /** The actual step-by-step process, for the popup's "the actual process" section -- a short
   *  bold title per step plus one short line, not a paragraph -- scannable in a few seconds. */
  mechanism: MechanismStep[]
  strength: string
  /** How it turns history into the next value, written the way a person would say it. */
  rule: string
  /** Zero-jargon version of `mechanism`, for the client-facing "how it thinks" popup -- no
   *  "transformer"/"extrapolate"/etc, written the way you'd explain it out loud to someone
   *  non-technical. */
  simple: string
  /** One punchy, memorable sentence for the popup's closing "in plain words" line -- a
   *  personality-driven summary, not a restatement of `simple`. */
  tldr: string
  /** For the popup's "where the number comes from" section -- how THIS model specifically
   *  consumes history (all of it? a window? one lookup?). Scope/backtest framing is added
   *  around this in the component; this is model-specific only. */
  dataSource: string
  /** For the popup's "why we trust it when it wins" section -- why a win from THIS model
   *  specifically is meaningful, tied to its own nature (transparent formula vs. opaque
   *  pretrained model vs. cost profile), not a generic policy statement. */
  trustReason: string
  /** A one-line concrete numbers walkthrough for the popup's "simple example" section --
   *  made-up round numbers, not live data, chosen purely to make the mechanism click. */
  example: string
}

export const MODEL_DOCS: Record<string, ModelDoc> = {
  naive_last_value: {
    label: 'Naive (last value)',
    kind: 'statistical',
    oneLiner: 'Repeats the most recent number.',
    mechanism: [
      { title: 'Looks at the last number', text: 'Ignores everything except the most recent recorded value.' },
      { title: 'Repeats it forward', text: 'No math, no averaging — just copies that number ahead.' },
    ],
    strength: 'The honest baseline. If nothing can beat "just repeat last time," nothing is adding value.',
    rule: 'forecast = last observed value',
    example: 'Last month ₹31,00,000 → next month forecast: ₹31,00,000. Unchanged.',
    simple: 'It just repeats the most recent real number forward — no math, no pattern-spotting.',
    tldr: 'The honest baseline — if a fancier model can’t beat "just repeat last time," it isn’t earning its keep.',
    dataSource: 'No training step — it looks up the single most recent number and repeats it forward.',
    trustReason: 'Nothing hidden to misjudge — one number, copied forward. A win means the last value really was the best guide.',
  },
  moving_avg: {
    label: 'Moving average',
    kind: 'statistical',
    oneLiner: 'Averages the recent periods.',
    mechanism: [
      { title: 'Takes a recent window', text: 'Last 3 months monthly, or 8 weeks weekly.' },
      { title: 'Averages them', text: 'Adds them up and divides by how many periods.' },
      { title: 'Repeats the average', text: 'Uses that one number as the forecast every time.' },
    ],
    strength: 'Very stable on noisy, spiky series — one unusual month can’t drag it off course.',
    rule: 'forecast = mean(last N periods)',
    example: 'Last 3 months ₹30L / ₹32L / ₹31L → forecast: ₹31L (the average).',
    simple: 'It averages the last few periods and uses that as its guess — one odd period can’t throw it off.',
    tldr: 'A calm, steady guess — smooths out the noise, but always a step behind a real turn.',
    dataSource: 'Reads only the last few recorded periods — anything older is invisible to it.',
    trustReason: 'Fully visible logic: a handful of numbers, averaged. A win means smoothing beat the alternatives, not just sounded sensible.',
  },
  linear_trend: {
    label: 'Linear trend',
    kind: 'statistical',
    oneLiner: 'Extrapolates the straight-line trend.',
    mechanism: [
      { title: 'Plots the history', text: 'Turns each period into a point: time vs. value.' },
      { title: 'Fits a straight line', text: 'Finds the line that best fits every point — a spreadsheet trendline.' },
      { title: 'Reads off slope & start', text: 'The fit gives a starting level and a per-period change.' },
      { title: 'Extends the line', text: 'Plugs the future period straight into that formula.' },
    ],
    strength: 'Strong where growth is steady — champion on many full-year totals for exactly that reason.',
    rule: 'forecast = a + b × period_index (a, b fitted on history)',
    example: '4 months up ₹2L each time → forecast continues that same ₹2L step.',
    simple: 'It draws the straightest line through the past and continues that same line forward.',
    tldr: 'A straight-line bet on steady growth — shown only when that bet has actually paid off.',
    dataSource: 'Reads every recorded period, fits one straight line through all of it.',
    trustReason: 'Its whole "reasoning" is two numbers — a slope and a start — checkable by hand. A win means growth really was that steady.',
  },
  seasonal_naive: {
    label: 'Seasonal naive',
    kind: 'statistical',
    oneLiner: 'Repeats the same period one year back.',
    mechanism: [
      { title: 'Counts back one cycle', text: 'Goes back exactly 12 months, or 52 weeks.' },
      { title: 'Reads that value', text: 'Takes whatever really happened at that point last cycle.' },
      { title: 'Repeats it exactly', text: 'No growth adjustment — used exactly as recorded.' },
    ],
    strength: 'Captures a repeating annual shape for free — no fitting needed.',
    rule: 'forecast = value from one full cycle ago',
    example: 'Last December ₹40L → this December forecast: ₹40L.',
    simple: 'It looks at this same time last year and repeats it — built for sales with a yearly rhythm.',
    tldr: 'Trusts the calendar — if your sales repeat every year, this model already knows the shape.',
    dataSource: 'Reads exactly one number: what happened at this point one full cycle earlier.',
    trustReason: 'No concept of trend, only "what happened last cycle." A win is a real signal seasonality — not momentum — is driving this.',
  },
  chronos: {
    label: 'Chronos-2',
    kind: 'foundation',
    oneLiner: 'Pretrained time-series foundation model.',
    mechanism: [
      { title: 'Learns patterns', text: 'Trained once, offline, on millions of real time series from many industries.' },
      { title: 'Turns data into numbers', text: 'Converts your history into a numeric sequence (like tokens).' },
      { title: 'Matches learned shapes', text: 'Compares your recent numbers to trend/seasonal shapes it already knows — no retraining.' },
      { title: 'Outputs a range', text: 'Returns a full range of plausible values, not just one number.' },
    ],
    strength: 'Trends + seasonality, without needing to know which is which. Works across every grain and metric tested.',
    rule: 'forecast = pretrained transformer conditioned on the full history',
    example: "Predicts closest to Winnipeg Branch's monthly forecast — even if another model wins on the total. Each scope runs its own contest.",
    simple: 'A large AI already trained on huge amounts of real-world sales-like data. It spots trend and season on its own — nobody tells it what to look for.',
    tldr: 'The heavyweight — an AI that has seen countless sales patterns before, and it shows.',
    dataSource: 'Reads the full recorded history, plus patterns learned from a much larger pretraining corpus.',
    trustReason: 'No simple formula to check — its case rests entirely on its measured track record, which is why it still clears the same backtest bar.',
  },
  'claude-haiku-4-5': {
    label: 'Claude Haiku 4.5',
    kind: 'llm',
    oneLiner: 'An LLM given the raw numbers and asked to forecast.',
    mechanism: [
      { title: 'Reads the numbers as text', text: 'Your history is written into a prompt, asking for JSON only.' },
      { title: 'Predicts the next number', text: 'Completes the sequence the same way it completes a sentence.' },
      { title: 'Returns structured output', text: 'The reply is parsed straight out of its JSON response.' },
    ],
    strength: 'Genuinely competitive — won 83 of 302 monthly contests outright, no feature engineering.',
    rule: 'forecast = LLM completion over the numeric history, JSON-constrained',
    example: 'Shown 12, 14, 13, 16, 15, 18 → answers 17, picking up the climbing pattern.',
    simple: 'The same kind of AI behind chat assistants is shown your sales numbers as plain text and asked for the next one.',
    tldr: 'A language AI making a numbers call — surprisingly good, and only used where it has proven itself.',
    dataSource: 'The only candidate where numbers leave the app — sent as plain text to Claude Haiku 4.5.',
    trustReason: 'The only one costing a real network call, so it clears a stricter bar: it only runs where it already beat all 5 free models offline.',
  },
}

export const KIND_LABEL: Record<ModelDoc['kind'], string> = {
  statistical: 'Statistical baseline',
  foundation: 'Foundation model',
  llm: 'Large language model',
}

// One fixed, distinct color per model, reused everywhere a chart or legend shows more than one
// model at once (Model Lab's comparison chart, the Accuracy page) -- so a color always means
// the same model across the whole app rather than being re-picked per chart.
export const MODEL_COLORS: Record<string, string> = {
  chronos: 'var(--color-primary-600)',
  'claude-haiku-4-5': 'var(--color-accent-500)',
  seasonal_naive: 'var(--color-violet-500)',
  linear_trend: 'var(--color-orange-500)',
  moving_avg: 'var(--color-cyan-500)',
  naive_last_value: 'var(--color-rose-400)',
}
