import { describe, expect, it } from 'vitest';
import { buildLogEntry } from './logging';
import { emptyDraft, ingredientFromFood, portionCount, portionWeightG, portionsToGrams, nutritionForPortions, recipeFromDraft, recipePer100ForLogging, draftFromRecipe, gramsToPortions } from './recipes';
import { parseBackup } from '../db/backup';
import type { Food, Recipe } from '../types';

const food = (protein: number, kcal: number): Food => ({
  id: 'f', name: 'Stuff', category: 'custom', proteinPer100g: protein, carbsPer100g: 10, fatPer100g: 4, caloriesPer100g: kcal, isLiquid: false,
  nutritionBasis: 'as-packaged', source: 'custom', createdAt: 1, updatedAt: 1,
});
/** A recipe from one ingredient: `rawG` of food, finished dish weighs `cookedG`, makes `portions`. */
const recipe = (rawG: number, cookedG: number | null, portions: number, f = food(10, 120)): Recipe => {
  const d = emptyDraft();
  d.name = 'R'; d.ingredients = [ingredientFromFood(f, rawG)]; d.cookedTotalWeightG = cookedG; d.portions = portions;
  return recipeFromDraft(d);
};

describe('recipe portions', () => {
  it('your example 1: a 150 g dish with 15 g protein set as ONE portion logs 150 g and 15 g protein', () => {
    const r = recipe(150, 150, 1); // 150 g of a 10 g/100 g food = 15 g protein
    expect(r.totals.protein).toBeCloseTo(15);
    expect(portionWeightG(r)).toBe(150);
    const e = buildLogEntry({ date: '2026-11-25', mealType: 'lunch', recipeId: r.id, name: r.name, consumedWeightG: portionsToGrams(r, 1), per100: recipePer100ForLogging(r) });
    expect(e.consumedWeightG).toBe(150);
    expect(e.protein).toBeCloseTo(15);
    expect(e.carbs).toBeCloseTo(r.totals.carbs);
    expect(e.calories).toBeCloseTo(r.totals.calories);
  });

  it('your example 2: a 1 kg dish that makes 4 portions — 2 portions are 500 g and half of everything', () => {
    const r = recipe(1000, 1000, 4, food(20, 150));
    expect(portionCount(r)).toBe(4);
    expect(portionWeightG(r)).toBe(250);
    expect(portionsToGrams(r, 2)).toBe(500);
    const e = buildLogEntry({ date: '2026-11-25', mealType: 'lunch', recipeId: r.id, name: r.name, consumedWeightG: portionsToGrams(r, 2), per100: recipePer100ForLogging(r) });
    expect(e.consumedWeightG).toBe(500);
    expect(e.protein).toBeCloseTo(r.totals.protein / 2); // 100 g of 200 g
    expect(e.calories).toBeCloseTo(r.totals.calories / 2);
    expect(e.fat).toBeCloseTo(r.totals.fat / 2);
  });

  it('portions are exact whatever the cooked weight is (water loss does not change the macros per portion)', () => {
    const r = recipe(1000, 800, 4, food(20, 150));
    expect(portionWeightG(r)).toBe(200);
    expect(nutritionForPortions(r, 1).protein).toBeCloseTo(r.totals.protein / 4);
    expect(nutritionForPortions(r, 4).protein).toBeCloseTo(r.totals.protein);
    const viaWeight = buildLogEntry({ date: '2026-11-25', mealType: 'dinner', name: 'x', consumedWeightG: portionsToGrams(r, 3), per100: recipePer100ForLogging(r) });
    expect(viaWeight.protein).toBeCloseTo(nutritionForPortions(r, 3).protein);
  });

  it('without a cooked weight the raw total is used', () => {
    const r = recipe(600, null, 3);
    expect(portionWeightG(r)).toBe(200);
  });

  it('the first saved portion size is the portion; other saved sizes are kept', () => {
    const d = emptyDraft(); d.name = 'R'; d.ingredients = [ingredientFromFood(food(10, 120), 1000)]; d.cookedTotalWeightG = 1000; d.portions = 4; d.portionSizesG = [400];
    const r = recipeFromDraft(d);
    expect(r.portions).toBe(4);
    expect(r.portionSizesG).toEqual([250, 400]);
  });

  it('recipes made before portions existed derive the count from their saved portion size', () => {
    const old = { ...recipe(1750, 1750, 1), portions: undefined, portionSizesG: [350] } as Recipe;
    expect(portionWeightG(old)).toBe(350);
    expect(portionCount(old)).toBe(5);
    expect(draftFromRecipe(old).portions).toBe(5);
    const noSize = { ...old, portionSizesG: [] } as Recipe;
    expect(portionCount(noSize)).toBe(1); // no size known → the whole dish is one portion
  });

  it('converts between grams and portions', () => {
    const r = recipe(1000, 1000, 4);
    expect(gramsToPortions(r, 500)).toBe(2);
    expect(gramsToPortions(r, 125)).toBe(0.5);
  });

  it('a fractional portion count works (e.g. a bake that makes 2.5 portions)', () => {
    const r = recipe(500, 500, 2.5);
    expect(portionWeightG(r)).toBe(200);
    expect(portionCount(r)).toBe(2.5);
  });

  it('portions survive a backup round trip and junk is ignored', () => {
    const r = recipe(1000, 1000, 4);
    const ok = parseBackup(JSON.stringify({ app: 'Demeter', schemaVersion: 3, data: { recipes: [r] } }));
    expect(ok.ok && ok.data.recipes[0].portions).toBe(4);
    const junk = parseBackup(JSON.stringify({ app: 'Demeter', schemaVersion: 3, data: { recipes: [{ ...r, portions: 'many' }] } }));
    expect(junk.ok && junk.data.recipes[0].portions).toBeUndefined();
  });
});
