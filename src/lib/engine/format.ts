/** Rounding & formatting helpers. Calculations stay full-precision; only display is rounded. */

/** Round half away from zero with float-noise correction (1.005 → 1.01, -1.005 → -1.01). */
export function roundTo(value: number, decimals = 1): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** decimals;
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  // The 1e-9 relative nudge fixes binary representation errors such as 1.005 * 100 = 100.49999999999999.
  const r = Math.round(abs * f * (1 + 1e-12) + 1e-9) / f;
  return sign * r === 0 ? 0 : sign * r;
}

/** "25", "137.5", "0.3" — trims trailing zeros. */
export function fmtNum(value: number, maxDecimals = 1): string {
  if (!Number.isFinite(value)) return '–';
  const r = roundTo(value, maxDecimals);
  return r.toLocaleString('en-US', { maximumFractionDigits: maxDecimals, minimumFractionDigits: 0 });
}

/**
 * Display grams / macros sensibly: tiny values keep precision, big ones drop decimals.
 *   0.04 → "0.04", 3.456 → "3.5", 25 → "25", 137.5 → "137.5" (detail), 1432.6 → "1,433" (totals)
 */
export function fmtSmart(value: number, opts: { detail?: boolean } = {}): string {
  if (!Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs < 0.1) return fmtNum(value, 2);
  if (abs < 1000 && opts.detail) return fmtNum(value, 1);
  if (abs < 100) return fmtNum(value, 1);
  return fmtNum(value, 0);
}

/** Calories: detail views show up to one decimal ("412.5"), lists/totals show whole numbers. */
export function fmtKcal(value: number, detail = false): string {
  return detail ? fmtNum(value, 1) : fmtNum(value, 0);
}

export const fmtG = (value: number, detail = false) => `${fmtSmart(value, { detail })} g`;

export function pct(value: number, decimals = 0): string {
  return `${fmtNum(value, decimals)}%`;
}
