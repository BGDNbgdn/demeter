/**
 * Prices and "protein per euro". Everything here is pure.
 *
 * A price is stored as "one pack costs X and holds Y grams" (that is what the shelf label says),
 * and converted to a price per kg for every calculation.
 */
import type { AppSettings, Food, FoodPrice } from '../types';

export const DEFAULT_CURRENCY = '€';
export const currencyOf = (s: Pick<AppSettings, 'currency'> | undefined) => (s?.currency?.trim() || DEFAULT_CURRENCY);

export const isLivePrice = (p: FoodPrice | undefined): p is FoodPrice => !!p && !p.deletedAt && p.packG > 0 && p.packPrice >= 0;

export function pricePerKg(p: Pick<FoodPrice, 'packPrice' | 'packG'>): number {
  return p.packG > 0 ? (p.packPrice / p.packG) * 1000 : 0;
}

/** What `grams` of this food costs. */
export function costOfGrams(p: Pick<FoodPrice, 'packPrice' | 'packG'>, grams: number): number {
  return (pricePerKg(p) * grams) / 1000;
}

/** "€2.49" — always two decimals, symbol first. */
export function fmtMoney(amount: number, currency = DEFAULT_CURRENCY): string {
  if (!Number.isFinite(amount)) return `${currency}–`;
  return `${currency}${amount.toFixed(2)}`;
}

export interface ProteinValue {
  /** Money for one gram of protein. */
  perGramProtein: number;
  /** Money for 20 g of protein — the number people actually think in. */
  per20g: number;
  /** Grams of protein you get for one unit of currency. */
  gramsPerCurrency: number;
}

/** Protein value of a food at a price. null when the food has (almost) no protein, so the ratio would be meaningless. */
export function proteinValue(food: Pick<Food, 'proteinPer100g'>, price: Pick<FoodPrice, 'packPrice' | 'packG'>): ProteinValue | null {
  if (!(food.proteinPer100g >= 1)) return null;
  const kg = pricePerKg(price);
  if (!(kg > 0)) return null;
  // kg of food costs `kg`; it holds proteinPer100g × 10 g of protein
  const perGram = kg / (food.proteinPer100g * 10);
  return { perGramProtein: perGram, per20g: perGram * 20, gramsPerCurrency: 1 / perGram };
}

export interface ValueRow { food: Food; price: FoodPrice; perKg: number; value: ProteinValue }

/** Priced foods ranked from best (cheapest 20 g of protein) to worst. */
export function rankByValue(prices: FoodPrice[], lookup: (foodId: string) => Food | undefined): ValueRow[] {
  const rows: ValueRow[] = [];
  for (const price of prices) {
    if (!isLivePrice(price)) continue;
    const food = lookup(price.foodId);
    if (!food) continue;
    const value = proteinValue(food, price);
    if (!value) continue;
    rows.push({ food, price, perKg: pricePerKg(price), value });
  }
  return rows.sort((a, b) => a.value.per20g - b.value.per20g || a.food.name.localeCompare(b.food.name));
}

export interface RecipeCost {
  /** Cost of the priced ingredients for one batch (as written). */
  total: number;
  priced: number;
  ingredients: number;
  /** Names of ingredients without a price (so the total is a lower bound). */
  missing: string[];
  /** Cost of 100 g of the finished (cooked) dish — only when the cooked weight is known. */
  per100Cooked: number | null;
  per20gProtein: number | null;
}

/** Just the parts of a recipe (or an unsaved draft) that cost needs. */
export interface CostableRecipe {
  ingredients: Array<{ foodId?: string; name: string; rawWeightG: number | null }>;
  cookedTotalWeightG?: number | null;
  totals: { protein: number };
}

export function recipeCost(recipe: CostableRecipe, priceOf: (foodId: string) => FoodPrice | undefined, batches = 1): RecipeCost {
  let total = 0; let priced = 0; const missing: string[] = [];
  for (const ing of recipe.ingredients) {
    const p = ing.foodId ? priceOf(ing.foodId) : undefined;
    if (isLivePrice(p) && (ing.rawWeightG ?? 0) > 0) { total += costOfGrams(p, ing.rawWeightG ?? 0); priced++; } else missing.push(ing.name);
  }
  total *= batches;
  const cooked = recipe.cookedTotalWeightG ? recipe.cookedTotalWeightG * batches : 0;
  const protein = recipe.totals.protein * batches;
  return {
    total, priced, ingredients: recipe.ingredients.length, missing,
    per100Cooked: cooked > 0 && priced > 0 ? (total / cooked) * 100 : null,
    per20gProtein: protein >= 1 && priced > 0 ? (total / protein) * 20 : null,
  };
}

/** Cost of one portion of a recipe, given the portion's cooked weight. null if unknown. */
export function portionCost(cost: RecipeCost, portionG: number): number | null {
  return cost.per100Cooked != null && portionG > 0 ? (cost.per100Cooked * portionG) / 100 : null;
}
