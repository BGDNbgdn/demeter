/**
 * Weekly review: what actually happened, computed only from your own log. Pure functions.
 *
 * Rules of thumb used throughout:
 *  - A day with nothing logged is "not tracked", not "zero" (it would drag every average down).
 *  - Today is still in progress: it only counts once it already reaches the streak threshold.
 *  - Suggestions only ever use foods you actually eat (your own median portion), never generic advice.
 */
import type { MealLogEntry, MealType } from '../types';
import { MEAL_TYPES } from '../types';
import { STREAK_THRESHOLD } from './streak';
import { addDays, dateRange, parseDateStr, startOfWeek, todayStr } from '../utils/dates';

export const DOW_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const dowOf = (date: string) => (parseDateStr(date).getDay() + 6) % 7;
const MAIN_MEALS: MealType[] = ['breakfast', 'lunch', 'dinner'];
const WEEKS_FOR_WEEKDAY_STATS = 8;

export interface ReviewDay { date: string; protein: number; calories: number; count: number; counted: boolean }
export interface SourceStat { key: string; name: string; protein: number; share: number; times: number; typicalG: number; typicalProtein: number }
export interface MealStat { meal: MealType; protein: number; share: number; /** per tracked day */ avg: number }
export interface WeekdayStat { dow: number; label: string; avg: number; n: number }

export type InsightKind = 'data' | 'weekday' | 'meal' | 'spread' | 'short' | 'good';
export interface Insight { kind: InsightKind; title: string; body: string }

export interface WeekReview {
  from: string;
  to: string;
  days: ReviewDay[];
  trackedDays: number;
  /** Days that reached the streak threshold (75 % of the protein goal). */
  daysCounted: number;
  avgProtein: number;
  avgCalories: number;
  best: ReviewDay | null;
  worst: ReviewDay | null;
  prevAvgProtein: number | null;
  sources: SourceStat[];
  meals: MealStat[];
  weekdays: WeekdayStat[];
  insight: Insight;
  /** Today is part of this week and still open (not counted yet). */
  todayOpen: boolean;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const r0 = (n: number) => Math.round(n);

function dayTable(logs: MealLogEntry[], dates: string[], target: number, today: string): ReviewDay[] {
  const need = target * STREAK_THRESHOLD;
  const byDate = new Map<string, { protein: number; calories: number; count: number }>();
  for (const l of logs) {
    if (l.deletedAt) continue;
    const d = byDate.get(l.date) ?? { protein: 0, calories: 0, count: 0 };
    d.protein += l.protein; d.calories += l.calories; d.count++;
    byDate.set(l.date, d);
  }
  return dates.map(date => {
    const d = byDate.get(date) ?? { protein: 0, calories: 0, count: 0 };
    const counted = d.count > 0 && date <= today && (date < today || d.protein >= need);
    return { date, ...d, counted };
  });
}

const avgOf = (days: ReviewDay[], k: 'protein' | 'calories') => { const c = days.filter(d => d.counted); return c.length ? c.reduce((s, d) => s + d[k], 0) / c.length : 0; };

export function sourceStats(entries: MealLogEntry[], limit = 5): SourceStat[] {
  const total = entries.reduce((s, e) => s + e.protein, 0);
  const groups = new Map<string, MealLogEntry[]>();
  for (const e of entries) {
    const key = e.foodId ?? e.recipeId ?? e.name.trim().toLowerCase();
    const g = groups.get(key); if (g) g.push(e); else groups.set(key, [e]);
  }
  return [...groups.entries()].map(([key, es]) => {
    const protein = es.reduce((s, e) => s + e.protein, 0);
    const latest = es.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
    return {
      key, name: latest.name, protein, share: total > 0 ? protein / total : 0, times: es.length,
      typicalG: median(es.map(e => e.consumedWeightG).filter(g => g > 0)), typicalProtein: median(es.map(e => e.protein)),
    };
  }).sort((a, b) => b.protein - a.protein).slice(0, limit);
}

export function mealStats(entries: MealLogEntry[], trackedDays: number): MealStat[] {
  const total = entries.reduce((s, e) => s + e.protein, 0);
  return MEAL_TYPES.map(meal => {
    const protein = entries.filter(e => e.mealType === meal).reduce((s, e) => s + e.protein, 0);
    return { meal, protein, share: total > 0 ? protein / total : 0, avg: trackedDays > 0 ? protein / trackedDays : 0 };
  });
}

export function weekdayStats(days: ReviewDay[]): WeekdayStat[] {
  return DOW_NAMES.map((label, dow) => {
    const ds = days.filter(d => d.counted && dowOf(d.date) === dow);
    return { dow, label, avg: ds.length ? ds.reduce((s, d) => s + d.protein, 0) / ds.length : 0, n: ds.length };
  });
}

const MEAL_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' };
export const mealLabel = (m: MealType) => MEAL_LABEL[m];

/** The best "anchor" food: one you eat more than once, with the most protein in your usual portion. */
function anchorFood(sources: SourceStat[]): SourceStat | null {
  return sources.filter(s => s.times >= 2 && s.typicalProtein >= 12).sort((a, b) => b.typicalProtein - a.typicalProtein)[0] ?? null;
}

export function pickInsight(r: Omit<WeekReview, 'insight'>, target: number): Insight {
  if (r.trackedDays < 3) {
    return { kind: 'data', title: 'Not enough days yet', body: `Only ${r.trackedDays} day${r.trackedDays === 1 ? '' : 's'} logged this week. Log at least 3 and Demeter can show you patterns.` };
  }
  const anchor = anchorFood(r.sources);
  const anchorText = (what: string) => (anchor ? ` Your usual ${anchor.name} (${r0(anchor.typicalG)} g) has ${r0(anchor.typicalProtein)} g protein — ${what}` : '');

  // 1. a weekday that is clearly weaker than the rest
  const usable = r.weekdays.filter(w => w.n >= 3);
  if (usable.length >= 3) {
    const weakest = [...usable].sort((a, b) => a.avg - b.avg)[0];
    const others = usable.filter(w => w.dow !== weakest.dow);
    const othersAvg = others.reduce((s, w) => s + w.avg, 0) / others.length;
    const gap = othersAvg - weakest.avg;
    if (gap >= Math.max(20, target * 0.15)) {
      return {
        kind: 'weekday', title: `${weakest.label}s are your weak spot`,
        body: `On ${weakest.label}s you average ${r0(weakest.avg)} g protein, against ${r0(othersAvg)} g on other days (${r0(gap)} g less, across ${weakest.n} ${weakest.label}s).${anchorText(`one extra on ${weakest.label}s would close most of the gap.`)}`,
      };
    }
  }

  // 2. a main meal that adds almost nothing
  const mains = r.meals.filter(m => MAIN_MEALS.includes(m.meal));
  const weakMeal = [...mains].sort((a, b) => a.avg - b.avg)[0];
  if (weakMeal && weakMeal.avg < target * 0.15 && r.avgProtein > 0) {
    const lift = anchor ? ` Adding your usual ${anchor.name} there (+${r0(anchor.typicalProtein)} g) would take your day from ${r0(r.avgProtein)} g to about ${r0(r.avgProtein + anchor.typicalProtein)} g.` : '';
    return {
      kind: 'meal', title: `${mealLabel(weakMeal.meal)} is your weakest meal`,
      body: `${mealLabel(weakMeal.meal)} gives only ${r0(weakMeal.avg)} g protein on a typical day (${r0(weakMeal.share * 100)}% of your total).${lift}`,
    };
  }

  // 3. one meal carrying most of the protein
  const top = [...r.meals].sort((a, b) => b.share - a.share)[0];
  if (top && top.share >= 0.55) {
    return {
      kind: 'spread', title: `${mealLabel(top.meal)} carries most of your protein`,
      body: `${r0(top.share * 100)}% of your protein comes at ${top.meal === 'snack' ? 'snack time' : top.meal}. Moving 20–30 g of it to another meal would even your day out.${anchorText('a natural thing to move.')}`,
    };
  }

  // 4. simply short of the goal
  const need = target * STREAK_THRESHOLD;
  if (r.avgProtein < need) {
    return {
      kind: 'short', title: 'Short of your protein goal',
      body: `You average ${r0(r.avgProtein)} g on the days you log, ${r0(target - r.avgProtein)} g under your ${r0(target)} g goal.${anchorText('one more portion a day would nearly close it.')}`,
    };
  }

  return {
    kind: 'good', title: 'A solid week',
    body: `${r.daysCounted} of ${r.trackedDays} tracked days reached ${r0(STREAK_THRESHOLD * 100)}% of your goal, averaging ${r0(r.avgProtein)} g. Nothing stands out as a weak spot — keep doing what you're doing.`,
  };
}

export function buildWeekReview(logs: MealLogEntry[], proteinTarget: number, anyDateInWeek: string, today = todayStr()): WeekReview {
  const from = startOfWeek(anyDateInWeek);
  const to = addDays(from, 6);
  const live = logs.filter(l => !l.deletedAt);
  const days = dayTable(live, dateRange(from, to), proteinTarget, today);
  const counted = days.filter(d => d.counted);
  const countedDates = new Set(counted.map(d => d.date));
  const weekEntries = live.filter(l => countedDates.has(l.date));

  // previous week (for the comparison)
  const prevFrom = addDays(from, -7);
  const prevDays = dayTable(live, dateRange(prevFrom, addDays(prevFrom, 6)), proteinTarget, today);
  const prevAvg = prevDays.some(d => d.counted) ? avgOf(prevDays, 'protein') : null;

  // weekday pattern over the last 8 weeks up to the end of this one
  const histFrom = addDays(from, -7 * (WEEKS_FOR_WEEKDAY_STATS - 1));
  const hist = dayTable(live, dateRange(histFrom, to), proteinTarget, today);

  const sorted = [...counted].sort((a, b) => a.protein - b.protein);
  const base = {
    from, to, days,
    trackedDays: counted.length,
    daysCounted: counted.filter(d => d.protein >= proteinTarget * STREAK_THRESHOLD).length,
    avgProtein: avgOf(days, 'protein'),
    avgCalories: avgOf(days, 'calories'),
    best: sorted.length ? sorted[sorted.length - 1] : null,
    worst: sorted.length ? sorted[0] : null,
    prevAvgProtein: prevAvg,
    sources: sourceStats(weekEntries),
    meals: mealStats(weekEntries, counted.length),
    weekdays: weekdayStats(hist),
    todayOpen: (() => { const t = days.find(d => d.date === today); return !!t && t.count > 0 && !t.counted; })(),
  };
  return { ...base, insight: pickInsight(base, proteinTarget) };
}
