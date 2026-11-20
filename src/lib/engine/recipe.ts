/**
 * Recipe engine: sums raw ingredient contributions, then derives per-100 g nutrition for the *finished* dish
 * from the total cooked weight (the same raw→cooked formula, applied to the whole dish).
 */
import type { Macros } from '../../types';
import { cookingChange, type CookingChange, type Issue } from './cooking';
import { fmtNum } from './format';
import {
  isNonNegative, isPositive, nutritionForWeight, per100FromTotals, scaleMacros, sumMacros, ZERO_MACROS,
} from './nutrition';

export interface RecipeIngredientInput {
  id?: string;
  name?: string;
  /** Nutrition per 100 g in the state the weight is entered (raw / as-packaged). */
  per100g: Macros;
  rawWeightG: number | null | undefined;
  /** Optional cooked weight of just this ingredient. */
  cookedWeightG?: number | null;
}

export interface IngredientResult {
  id?: string;
  name?: string;
  rawWeightG: number;
  cookedWeightG: number | null;
  contribution: Macros;
  /** Per 100 g of this ingredient after cooking, when its own cooked weight was entered. */
  per100Cooked: Macros | null;
  change: CookingChange | null;
  warnings: Issue[];
  errors: Issue[];
}

export type RecipeStatus = 'empty' | 'raw-only' | 'cooked' | 'invalid';
export type CookedWeightSource = 'entered' | 'sum-of-ingredients' | 'none';

export interface RecipeInput {
  ingredients: RecipeIngredientInput[];
  /** Total weight of the finished dish. */
  cookedTotalWeightG?: number | null;
}

export interface RecipeResult {
  status: RecipeStatus;
  rawTotalWeightG: number;
  cookedTotalWeightG: number | null;
  cookedWeightSource: CookedWeightSource;
  change: CookingChange | null;
  /** Nutrition of the whole recipe. Cooking does not change this. */
  totals: Macros;
  per100Raw: Macros;
  per100Cooked: Macros | null;
  ingredients: IngredientResult[];
  warnings: Issue[];
  errors: Issue[];
  explanation: string;
}

const provided = (n: number | null | undefined): n is number => n !== null && n !== undefined;

export function calculateRecipe(input: RecipeInput): RecipeResult {
  const warnings: Issue[] = [];
  const errors: Issue[] = [];
  const ingredients: IngredientResult[] = input.ingredients.map(ing => {
    const iw: Issue[] = [];
    const ie: Issue[] = [];
    let raw = 0;
    if (provided(ing.rawWeightG)) {
      if (isNonNegative(ing.rawWeightG)) raw = ing.rawWeightG;
      else ie.push({ code: 'invalid-raw-weight', message: `${ing.name ?? 'Ingredient'}: weight must be a positive number.` });
    }
    let cookedW: number | null = null;
    let change: CookingChange | null = null;
    let per100Cooked: Macros | null = null;
    if (provided(ing.cookedWeightG)) {
      if (!isPositive(ing.cookedWeightG)) {
        ie.push({ code: 'invalid-cooked-weight', message: `${ing.name ?? 'Ingredient'}: cooked weight must be greater than 0.` });
      } else if (isPositive(raw)) {
        cookedW = ing.cookedWeightG;
        change = cookingChange(raw, cookedW);
        per100Cooked = scaleMacros(ing.per100g, raw / cookedW);
        if (change && change.direction === 'gain') {
          iw.push({ code: 'cooked-heavier', message: `${ing.name ?? 'Ingredient'} gained weight when cooked (absorbed water/oil).` });
        }
      }
    }
    return {
      id: ing.id,
      name: ing.name,
      rawWeightG: raw,
      cookedWeightG: cookedW,
      contribution: ie.length ? { ...ZERO_MACROS } : nutritionForWeight(ing.per100g, raw),
      per100Cooked,
      change,
      warnings: iw,
      errors: ie,
    };
  });

  ingredients.forEach(i => { warnings.push(...i.warnings); errors.push(...i.errors); });

  const valid = ingredients.filter(i => i.errors.length === 0);
  const rawTotalWeightG = valid.reduce((s, i) => s + i.rawWeightG, 0);
  const totals = sumMacros(valid.map(i => i.contribution));
  const per100Raw = per100FromTotals(totals, rawTotalWeightG);

  // ---- cooked total: entered > sum of per-ingredient cooked weights > none
  let cookedTotalWeightG: number | null = null;
  let cookedWeightSource: CookedWeightSource = 'none';
  const entered = input.cookedTotalWeightG;
  if (provided(entered)) {
    if (isPositive(entered)) {
      cookedTotalWeightG = entered;
      cookedWeightSource = 'entered';
    } else {
      errors.push({
        code: 'invalid-cooked-weight',
        message: 'Total cooked weight must be greater than 0 (enter the weight of the finished dish).',
      });
    }
  } else if (valid.length > 0 && valid.every(i => i.rawWeightG > 0 && i.cookedWeightG !== null)) {
    cookedTotalWeightG = valid.reduce((s, i) => s + (i.cookedWeightG ?? 0), 0);
    cookedWeightSource = 'sum-of-ingredients';
  }

  if (cookedWeightSource === 'entered') {
    const partial = valid.filter(i => i.cookedWeightG !== null);
    if (partial.length === valid.length && valid.length > 0) {
      const sum = partial.reduce((s, i) => s + (i.cookedWeightG ?? 0), 0);
      if (sum > cookedTotalWeightG! + 0.5) {
        warnings.push({
          code: 'cooked-heavier',
          message: `Ingredient cooked weights add up to ${fmtNum(sum, 0)} g, more than the ${fmtNum(cookedTotalWeightG!, 0)} g total.`,
        });
      }
    }
  }

  let change: CookingChange | null = null;
  let per100Cooked: Macros | null = null;
  if (cookedTotalWeightG !== null && rawTotalWeightG > 0) {
    change = cookingChange(rawTotalWeightG, cookedTotalWeightG);
    per100Cooked = per100FromTotals(totals, cookedTotalWeightG);
    if (change) {
      if (change.direction === 'gain') {
        warnings.push({
          code: 'cooked-heavier',
          message: `The dish is ${fmtNum(change.retentionPct - 100, 0)}% heavier after cooking — fine if it absorbed water or oil (rice, pasta, stock), otherwise double-check the weight.`,
        });
      }
      if (change.retentionPct < 10) {
        warnings.push({ code: 'extreme-loss', message: `Cooked weight is only ${fmtNum(change.retentionPct, 1)}% of raw — double-check it.` });
      }
    }
  }

  const status: RecipeStatus =
    rawTotalWeightG <= 0 ? (errors.length ? 'invalid' : 'empty') : cookedTotalWeightG === null ? 'raw-only' : 'cooked';

  let explanation = '';
  if (change && per100Cooked) {
    if (change.direction === 'none') explanation = 'The dish did not change weight, so per-100 g nutrition is unchanged.';
    else {
      const verb = change.direction === 'loss' ? `lost ${fmtNum(change.lossPct, 1)}% of its weight` : `gained ${fmtNum(-change.lossPct, 1)}% weight`;
      const dir = per100Cooked.protein >= per100Raw.protein ? 'increased' : 'decreased';
      explanation = `The dish ${verb} during cooking. Protein density ${dir} from ${fmtNum(per100Raw.protein, 1)} g to ${fmtNum(per100Cooked.protein, 1)} g per 100 g.`;
    }
  }

  return {
    status, rawTotalWeightG, cookedTotalWeightG, cookedWeightSource, change,
    totals, per100Raw, per100Cooked, ingredients, warnings, errors, explanation,
  };
}

// ---------------------------------------------------------------- portions

/** Nutrition of a portion of finished dish. If cooked weight isn't known yet, falls back to the raw density. */
export function portionNutrition(result: Pick<RecipeResult, 'per100Cooked' | 'per100Raw'>, portionG: number): Macros {
  const base = result.per100Cooked ?? result.per100Raw;
  return nutritionForWeight(base, portionG);
}

export interface RemainingInfo {
  totalG: number;
  eatenG: number;
  remainingG: number;
  /** remaining ÷ portion (fractional), or null when no portion size. */
  portionsLeft: number | null;
  overEaten: boolean;
}

/** How much of the cooked batch is left after `eatenG` has been logged. */
export function remainingBatch(cookedTotalG: number | null | undefined, eatenG: number, portionG?: number | null): RemainingInfo | null {
  if (!isPositive(cookedTotalG)) return null;
  const eaten = isNonNegative(eatenG) ? eatenG : 0;
  const remaining = cookedTotalG - eaten;
  return {
    totalG: cookedTotalG,
    eatenG: eaten,
    remainingG: Math.max(0, remaining),
    portionsLeft: isPositive(portionG) ? Math.max(0, remaining) / portionG : null,
    overEaten: remaining < -0.5,
  };
}

/** Evenly split the cooked dish into N portions. */
export function evenPortionG(cookedTotalG: number | null | undefined, n: number): number | null {
  if (!isPositive(cookedTotalG) || !isPositive(n)) return null;
  return cookedTotalG / n;
}
