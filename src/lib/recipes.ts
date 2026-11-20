import type { Food, MealLogEntry, Macros, NutritionBasis, Recipe, RecipeIngredient } from '../types';
import { calculateRecipe, foodPer100, nutritionForWeight, type RecipeResult } from './engine';
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
  batchStartedAt?: string;
  isFavorite?: boolean;
  createdAt: number;
}

export function emptyDraft(): RecipeDraft {
  return { id: newId('rec'), name: '', ingredients: [], cookedTotalWeightG: null, portionSizesG: [], createdAt: Date.now() };
}

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
    portionSizesG: r.portionSizesG, batchStartedAt: r.batchStartedAt, isFavorite: r.isFavorite, createdAt: r.createdAt,
  };
}

export function calcDraft(d: RecipeDraft): RecipeResult {
  return calculateRecipe({
    ingredients: d.ingredients.map(i => ({ id: i.id, name: i.name, per100g: i.per100g, rawWeightG: i.rawWeightG, cookedWeightG: i.cookedWeightG })),
    cookedTotalWeightG: d.cookedTotalWeightG,
  });
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
    portionSizesG: [...new Set(d.portionSizesG.filter(p => p > 0))].sort((a, b) => a - b),
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
