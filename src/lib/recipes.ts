import type { Food, MealLogEntry, Macros, NutritionBasis, Recipe, RecipeIngredient } from '../types';
import { calculateRecipe, foodPer100, nutritionForWeight, scaleMacros, type RecipeResult } from './engine';
import { newId } from '../utils/id';
import { cookedName } from './foodNames';

export interface DraftIngredient {
  id: string;
  foodId?: string;
  name: string;
  per100g: Macros;
  nutritionBasis: NutritionBasis;
  rawWeightG: number | null;
  cookedWeightG?: number | null;
  defaultRetentionPercent?: number;
}

export interface RecipeDraft {
  id: string;
  name: string;
  notes?: string;
  ingredients: DraftIngredient[];
  cookedTotalWeightG: number | null;
  portionSizesG: number[];
  /** How many portions the whole dish makes (default 1: logging the recipe logs all of it). */
  portions: number;
  batchStartedAt?: string;
  isFavorite?: boolean;
  createdAt: number;
}

export function emptyDraft(): RecipeDraft {
  return { id: newId('rec'), name: '', ingredients: [], cookedTotalWeightG: null, portionSizesG: [], portions: 1, createdAt: Date.now() };
}

// ---------------------------------------------------------------- portions
type PortionInfo = Pick<Recipe, 'portions' | 'portionSizesG' | 'cookedTotalWeightG' | 'rawTotalWeightG'>;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Weight of the whole finished dish: cooked if you weighed it, otherwise the raw total. */
export function recipeTotalWeightG(r: Pick<Recipe, 'cookedTotalWeightG' | 'rawTotalWeightG'>): number {
  return r.cookedTotalWeightG ?? r.rawTotalWeightG;
}

/** Grams in ONE portion. Recipes made before portions existed use their first saved portion size. */
export function portionWeightG(r: PortionInfo): number {
  const total = recipeTotalWeightG(r);
  if (r.portions && r.portions > 0) return total / r.portions;
  return r.portionSizesG[0] && r.portionSizesG[0] > 0 ? r.portionSizesG[0] : total;
}

/** How many portions the dish makes. */
export function portionCount(r: PortionInfo): number {
  const w = portionWeightG(r);
  return w > 0 ? r2(recipeTotalWeightG(r) / w) : 1;
}

/** Nutrition of `n` portions: the whole recipe's totals × n ÷ portions (exact, whatever the weights are). */
export function nutritionForPortions(r: PortionInfo & Pick<Recipe, 'totals'>, n: number): Macros {
  const count = portionCount(r);
  return scaleMacros(r.totals, count > 0 ? n / count : 0);
}

/** Grams in `n` portions. */
export const portionsToGrams = (r: PortionInfo, n: number) => n * portionWeightG(r);
export const gramsToPortions = (r: PortionInfo, g: number) => { const w = portionWeightG(r); return w > 0 ? g / w : 0; };

export function ingredientFromFood(food: Food, rawWeightG: number | null = 100): DraftIngredient {
  return {
    id: newId('ing'),
    foodId: food.id,
    name: food.name,
    per100g: foodPer100(food),
    nutritionBasis: food.nutritionBasis,
    rawWeightG,
    defaultRetentionPercent: food.defaultCookedWeightRetentionPercent,
  };
}

export function draftFromRecipe(r: Recipe): RecipeDraft {
  return {
    id: r.id, name: r.name, notes: r.notes,
    ingredients: r.ingredients.map(i => ({
      id: i.id, foodId: i.foodId, name: i.name, per100g: i.per100g, nutritionBasis: i.nutritionBasis,
      rawWeightG: i.rawWeightG, cookedWeightG: i.cookedWeightG ?? null, defaultRetentionPercent: i.defaultRetentionPercent,
    })),
    cookedTotalWeightG: r.cookedTotalWeightG ?? null,
    portionSizesG: r.portionSizesG, portions: portionCount(r), batchStartedAt: r.batchStartedAt, isFavorite: r.isFavorite, createdAt: r.createdAt,
  };
}

export function calcDraft(d: RecipeDraft): RecipeResult {
  return calculateRecipe({
    ingredients: d.ingredients.map(i => ({ id: i.id, name: i.name, per100g: i.per100g, rawWeightG: i.rawWeightG, cookedWeightG: i.cookedWeightG })),
    cookedTotalWeightG: d.cookedTotalWeightG,
  });
}

/** `portions` and the matching one-portion weight (first in portionSizesG, other saved sizes kept after it). */
function portionFields(d: RecipeDraft, totalG: number): { portions: number; portionSizesG: number[] } {
  const portions = d.portions > 0 ? r2(d.portions) : 1;
  const pw = totalG > 0 ? Math.round((totalG / portions) * 10) / 10 : 0;
  const others = [...new Set(d.portionSizesG.filter(p => p > 0 && Math.abs(p - pw) > 0.05))].sort((a, b) => a - b);
  return { portions, portionSizesG: pw > 0 ? [pw, ...others] : others };
}

/** Turn an editable draft into a persistable Recipe with all calculated fields filled in. */
export function recipeFromDraft(d: RecipeDraft, now = Date.now()): Recipe {
  const calc = calcDraft(d);
  const ingredients: RecipeIngredient[] = d.ingredients.map((i, idx) => ({
    id: i.id, foodId: i.foodId, name: i.name, per100g: i.per100g, nutritionBasis: i.nutritionBasis,
    rawWeightG: i.rawWeightG ?? 0,
    ...(i.cookedWeightG ? { cookedWeightG: i.cookedWeightG } : {}),
    contribution: calc.ingredients[idx]?.contribution ?? nutritionForWeight(i.per100g, i.rawWeightG ?? 0),
    ...(i.defaultRetentionPercent ? { defaultRetentionPercent: i.defaultRetentionPercent } : {}),
  }));
  return {
    id: d.id,
    name: d.name.trim() || 'Untitled recipe',
    ...(d.notes ? { notes: d.notes } : {}),
    ingredients,
    rawTotalWeightG: calc.rawTotalWeightG,
    ...(calc.cookedTotalWeightG ? { cookedTotalWeightG: calc.cookedTotalWeightG } : {}),
    totals: calc.totals,
    per100Raw: calc.per100Raw,
    ...(calc.per100Cooked ? { per100Cooked: calc.per100Cooked } : {}),
    ...portionFields(d, calc.cookedTotalWeightG ?? calc.rawTotalWeightG),
    ...(d.batchStartedAt ? { batchStartedAt: d.batchStartedAt } : {}),
    ...(d.isFavorite ? { isFavorite: true } : {}),
    createdAt: d.createdAt,
    updatedAt: now,
  };
}

/** A one-ingredient "cooked batch" recipe, e.g. 1000 g raw chicken → 800 g cooked. */
export function batchRecipeFromFood(food: Food, rawWeightG: number, cookedWeightG: number, portionG: number | null, today: string): Recipe {
  const draft: RecipeDraft = {
    ...emptyDraft(),
    name: `${cookedName(food.name)} – batch`,
    ingredients: [ingredientFromFood(food, rawWeightG)],
    cookedTotalWeightG: cookedWeightG,
    portionSizesG: portionG ? [portionG] : [],
    portions: portionG && portionG > 0 ? Math.max(1, cookedWeightG / portionG) : 1,
    batchStartedAt: today,
  };
  return recipeFromDraft(draft);
}

/** Grams of this recipe's current batch already logged. */
export function eatenFromBatch(recipe: Pick<Recipe, 'id' | 'batchStartedAt'>, logs: MealLogEntry[]): number {
  const since = recipe.batchStartedAt ?? '0000-00-00';
  return logs.reduce((s, l) => (l.recipeId === recipe.id && l.date >= since ? s + l.consumedWeightG : s), 0);
}

/** Per-100 g (cooked, else raw) nutrition used for logging a portion. */
export function recipePer100ForLogging(r: Recipe): Macros {
  return r.per100Cooked ?? r.per100Raw;
}

// ---------------------------------------------------------------- scaling

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Multiply every weight in the recipe by `factor` (×1.5 = one and a half times as much).
 * Per-100 g nutrition does not change — only the amounts do. Weights are rounded to 0.1 g.
 */
export function scaleDraft(d: RecipeDraft, factor: number): RecipeDraft {
  if (!Number.isFinite(factor) || factor <= 0) return d;
  const sc = (v: number | null | undefined) => (v == null ? v : r1(v * factor));
  return {
    ...d,
    ingredients: d.ingredients.map(i => ({ ...i, rawWeightG: sc(i.rawWeightG) ?? null, cookedWeightG: sc(i.cookedWeightG) })),
    cookedTotalWeightG: sc(d.cookedTotalWeightG) ?? null,
  };
}

/** Factor needed to reach a target total (cooked weight if known, else raw weight). */
export function factorForTarget(d: RecipeDraft, targetG: number): number | null {
  const base = d.cookedTotalWeightG ?? d.ingredients.reduce((s, i) => s + (i.rawWeightG ?? 0), 0);
  return base > 0 && targetG > 0 ? targetG / base : null;
}

// ---------------------------------------------------------------- ingredient drift

export interface IngredientDrift {
  ingredientId: string;
  foodId: string;
  name: string;
  /** 'changed': the food now has different numbers; 'missing': the source food was deleted. */
  kind: 'changed' | 'missing';
  before: Macros;
  after: Macros | null;
  /** The food as it is now (when still available) so it can be applied. */
  food: Food | null;
}

const differs = (a: Macros, b: Macros) =>
  (['protein', 'carbs', 'fat', 'calories', 'fiber'] as const).some(k => Math.abs(a[k] - b[k]) > 0.05);

/**
 * Compare each ingredient's saved nutrition snapshot with the food it came from.
 * Recipes keep snapshots on purpose (so they never change by surprise) — this surfaces differences so you can choose to update.
 */
export function findIngredientDrift(ingredients: Array<Pick<DraftIngredient, 'id' | 'foodId' | 'name' | 'per100g' | 'nutritionBasis'>>, lookup: (foodId: string) => Food | undefined): IngredientDrift[] {
  const out: IngredientDrift[] = [];
  for (const i of ingredients) {
    if (!i.foodId) continue;
    const f = lookup(i.foodId);
    if (!f) { out.push({ ingredientId: i.id, foodId: i.foodId, name: i.name, kind: 'missing', before: i.per100g, after: null, food: null }); continue; }
    const after = foodPer100(f);
    if (differs(i.per100g, after) || i.nutritionBasis !== f.nutritionBasis) {
      out.push({ ingredientId: i.id, foodId: i.foodId, name: f.name, kind: 'changed', before: i.per100g, after, food: f });
    }
  }
  return out;
}

/** Apply the current food values to the listed ingredients (weights stay as they are). */
export function applyDrift(d: RecipeDraft, drifts: IngredientDrift[]): RecipeDraft {
  const byId = new Map(drifts.filter(x => x.kind === 'changed' && x.food).map(x => [x.ingredientId, x.food as Food]));
  return {
    ...d,
    ingredients: d.ingredients.map(i => {
      const f = byId.get(i.id);
      return f ? { ...i, name: f.name, per100g: foodPer100(f), nutritionBasis: f.nutritionBasis, defaultRetentionPercent: f.defaultCookedWeightRetentionPercent } : i;
    }),
  };
}

/** "protein 20 → 24 g · 110 → 120 kcal" — only the nutrients that actually differ. */
export function describeDrift(before: Macros, after: Macros, basisChanged = false): string {
  const parts: string[] = [];
  const f = (n: number) => String(Math.round(n * 10) / 10);
  const add = (label: string, a: number, b: number, unit: string) => { if (Math.abs(a - b) > 0.05) parts.push(`${label} ${f(a)} → ${f(b)}${unit}`); };
  add('protein', before.protein, after.protein, ' g');
  add('carbs', before.carbs, after.carbs, ' g');
  add('fat', before.fat, after.fat, ' g');
  add('', before.calories, after.calories, ' kcal');
  add('fibre', before.fiber, after.fiber, ' g');
  if (basisChanged) parts.push('raw/cooked basis changed');
  return parts.map(x => x.trim()).join(' · ');
}
