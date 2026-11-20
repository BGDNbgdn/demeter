const p2 = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (never UTC, so late-night logs land on the right day). */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
}
export const todayStr = () => toDateStr(new Date());

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(s: string, n: number): string {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDateStr(b).getTime() - parseDateStr(a).getTime()) / 86_400_000);
}

/** Inclusive list of dates from → to. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; daysBetween(d, to) >= 0 && out.length < 800; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday of the week containing `s`. */
export function startOfWeek(s: string): string {
  const d = parseDateStr(s);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return addDays(s, -dow);
}

export function startOfMonth(s: string): string {
  return `${s.slice(0, 7)}-01`;
}

export function endOfMonth(s: string): string {
  const d = parseDateStr(s);
  return toDateStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDayLabel(s: string, today = todayStr()): string {
  if (s === today) return 'Today';
  if (s === addDays(today, -1)) return 'Yesterday';
  if (s === addDays(today, 1)) return 'Tomorrow';
  const d = parseDateStr(s);
  return `${WD[d.getDay()]}, ${d.getDate()} ${MO[d.getMonth()]}`;
}

export function formatShort(s: string): string {
  const d = parseDateStr(s);
  return `${d.getDate()} ${MO[d.getMonth()]}`;
}

export function weekdayShort(s: string): string {
  return WD[parseDateStr(s).getDay()];
}

export function monthTitle(s: string): string {
  const d = parseDateStr(s);
  return `${MO[d.getMonth()]} ${d.getFullYear()}`;
}

/** Sensible default meal for the current time of day. */
export function defaultMealForNow(now = new Date()): 'breakfast' | 'lunch' | 'dinner' | 'snack' {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= 4 && h < 10.5) return 'breakfast';
  if (h >= 10.5 && h < 15) return 'lunch';
  if (h >= 15 && h < 17) return 'snack';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}
