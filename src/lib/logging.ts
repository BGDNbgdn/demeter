import type { Macros, MealLogEntry, MealType } from '../types';
import { nutritionForWeight } from './engine';
import { newId } from '../utils/id';

export interface NewLogInput {
  date: string;
  mealType: MealType;
  name: string;
  foodId?: string;
  recipeId?: string;
  consumedWeightG: number;
  per100: Macros;
  notes?: string;
  cooking?: MealLogEntry['cooking'];
}

/** Build a log entry with calculated nutrition snapshot. */
export function buildLogEntry(input: NewLogInput, now = Date.now()): MealLogEntry {
  const m = nutritionForWeight(input.per100, input.consumedWeightG);
  return {
    id: newId('log'),
    date: input.date,
    mealType: input.mealType,
    name: input.name,
    ...(input.foodId ? { foodId: input.foodId } : {}),
    ...(input.recipeId ? { recipeId: input.recipeId } : {}),
    consumedWeightG: input.consumedWeightG,
    protein: m.protein, carbs: m.carbs, fat: m.fat, calories: m.calories, fiber: m.fiber,
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.cooking ? { cooking: input.cooking } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

export function totalsOf(entries: MealLogEntry[]): Macros {
  return entries.reduce<Macros>(
    (t, e) => ({ protein: t.protein + e.protein, carbs: t.carbs + e.carbs, fat: t.fat + e.fat, calories: t.calories + e.calories, fiber: t.fiber + e.fiber }),
    { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 },
  );
}

export interface DayTotal extends Macros { date: string; count: number }

/** Totals for each date in the list (days with no entries are included as zeros). */
export function dailyTotals(entries: MealLogEntry[], dates: string[]): DayTotal[] {
  const byDate = new Map<string, MealLogEntry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.date);
    if (arr) arr.push(e); else byDate.set(e.date, [e]);
  }
  return dates.map(date => {
    const list = byDate.get(date) ?? [];
    return { date, count: list.length, ...totalsOf(list) };
  });
}

/** Manual "quick add" entry — macros entered directly, no food behind it. */
export function buildManualLogEntry(input: { date: string; mealType: MealType; name: string; macros: Macros }, now = Date.now()): MealLogEntry {
  return {
    id: newId('log'), date: input.date, mealType: input.mealType, name: input.name || 'Quick add', consumedWeightG: 0,
    protein: input.macros.protein, carbs: input.macros.carbs, fat: input.macros.fat, calories: input.macros.calories, fiber: input.macros.fiber,
    createdAt: now, updatedAt: now,
  };
}
