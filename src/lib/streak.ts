import type { MealLogEntry } from '../types';
import { addDays, todayStr } from '../utils/dates';

/** A day counts when protein reaches this share of the daily protein target. */
export const STREAK_THRESHOLD = 0.75;

export interface StreakInfo {
  /** Consecutive qualifying days ending today (if today qualifies) or yesterday (if today is still open). */
  current: number;
  best: number;
  todayMet: boolean;
  /** Protein still needed today to extend the streak (0 once met). */
  proteinToGoToday: number;
  /** The streak is alive but today has not qualified yet. */
  atRisk: boolean;
  threshold: number;
}

export function proteinByDate(logs: MealLogEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of logs) {
    if (l.deletedAt) continue;
    m.set(l.date, (m.get(l.date) ?? 0) + l.protein);
  }
  return m;
}

/**
 * Streak of days with protein ≥ 75 % of the target. Nothing else matters (not number of meals, not calories).
 * Today never breaks a streak while it is still in progress. Uses the *current* target for all past days.
 */
export function computeStreaks(logs: MealLogEntry[], proteinTarget: number, today = todayStr()): StreakInfo {
  const empty: StreakInfo = { current: 0, best: 0, todayMet: false, proteinToGoToday: 0, atRisk: false, threshold: STREAK_THRESHOLD };
  if (!(proteinTarget > 0)) return empty;
  const need = proteinTarget * STREAK_THRESHOLD;
  const byDate = proteinByDate(logs);
  const met = (d: string) => (byDate.get(d) ?? 0) + 1e-9 >= need;

  const todayMet = met(today);
  let current = 0;
  for (let d = todayMet ? today : addDays(today, -1); met(d); d = addDays(d, -1)) current++;

  // best run over all logged dates
  const qualifying = [...byDate.keys()].filter(met).sort();
  let best = 0; let run = 0; let prev: string | null = null;
  for (const d of qualifying) {
    run = prev && addDays(prev, 1) === d ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return {
    current, best: Math.max(best, current), todayMet,
    proteinToGoToday: todayMet ? 0 : Math.max(0, need - (byDate.get(today) ?? 0)),
    atRisk: !todayMet && current > 0,
    threshold: STREAK_THRESHOLD,
  };
}
