import { DISPLAY_NAMES } from '../data/displayNames'

/** Cosmetic-only display name for a dimension value, e.g. displayName('branch', 'Medical
 *  Branch 01') -> 'Toronto Branch'. Passes the real value straight through for dimensions with
 *  no mapping (category, customer_type, product_type -- already realistic) or a value this
 *  mapping doesn't recognize.
 *
 *  Purely a rendering concern: nothing that goes back to the API -- filter state, drill-down
 *  targets, dropdown `value`s -- ever uses this. Only what's shown on screen does. */
export function displayName(dimension: string | null | undefined, real: string | null | undefined): string {
  if (real == null) return ''
  if (!dimension) return real
  return DISPLAY_NAMES[dimension]?.[real] ?? real
}
