import type { Food, Macros } from '../../types';

export const ZERO_MACROS: Macros = Object.freeze({ protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 });

/** True for finite numbers strictly greater than zero. */
export function isPositive(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** True for finite numbers ≥ 0. */
export function isNonNegative(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

export function makeMacros(partial: Partial<Macros> = {}): Macros {
  return {
    protein: partial.protein ?? 0,
    carbs: partial.carbs ?? 0,
    fat: partial.fat ?? 0,
    calories: partial.calories ?? 0,
    fiber: partial.fiber ?? 0,
  };
}

/** Nutrition per 100 g of a Food, as a Macros object. */
export function foodPer100(food: Pick<Food, 'proteinPer100g' | 'carbsPer100g' | 'fatPer100g' | 'caloriesPer100g' | 'fiberPer100g'>): Macros {
  return {
    protein: food.proteinPer100g,
    carbs: food.carbsPer100g,
    fat: food.fatPer100g,
    calories: food.caloriesPer100g,
    fiber: food.fiberPer100g ?? 0,
  };
}

/** Multiply every nutrient by a factor. */
export function scaleMacros(m: Macros, factor: number): Macros {
  if (!Number.isFinite(factor)) return { ...ZERO_MACROS };
  return {
    protein: m.protein * factor,
    carbs: m.carbs * factor,
    fat: m.fat * factor,
    calories: m.calories * factor,
    fiber: m.fiber * factor,
  };
}

/** Nutrition contained in `grams` of a food with the given per-100 g values. Invalid weights → zero. */
export function nutritionForWeight(per100: Macros, grams: number): Macros {
  if (!isNonNegative(grams)) return { ...ZERO_MACROS };
  return scaleMacros(per100, grams / 100);
}

export function addMacros(a: Macros, b: Macros): Macros {
  return {
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    calories: a.calories + b.calories,
    fiber: a.fiber + b.fiber,
  };
}

export function sumMacros(list: Macros[]): Macros {
  return list.reduce(addMacros, { ...ZERO_MACROS });
}

/** Nutrition per 100 g given totals for a known weight. Weight ≤ 0 → zeros. */
export function per100FromTotals(totals: Macros, weightG: number): Macros {
  if (!isPositive(weightG)) return { ...ZERO_MACROS };
  return scaleMacros(totals, 100 / weightG);
}

/** Energy from macros (Atwater 4/4/9) — used for sanity checks and custom-food hints. */
export function atwaterKcal(m: Pick<Macros, 'protein' | 'carbs' | 'fat'>): number {
  return 4 * m.protein + 4 * m.carbs + 9 * m.fat;
}
