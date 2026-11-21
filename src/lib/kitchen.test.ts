import { describe, expect, it } from 'vitest';
import type { Food, FoodPrice, PantryItem, PlanLine, Recipe } from '../types';
import { costOfGrams, fmtMoney, portionCost, pricePerKg, proteinValue, rankByValue, recipeCost } from './cost';
import { buildShoppingList, describePlan, haveByKey, linesToCopy, normCode, pantryItemForBarcode, shoppingText, upsertPlanLine, type PlanLookups } from './kitchen';
import { OffError, parseOffProduct, type OffProduct } from './openFoodFacts';
import { foodFromOffProduct, parsePackGrams } from './openFoodFactsPack';
import { resolveBarcode, type ScanDeps } from './pantry';

const z = { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 };
const food = (id: string, protein: number, extra: Partial<Food> = {}): Food => ({
  id, name: id, category: 'protein', proteinPer100g: protein, carbsPer100g: 0, fatPer100g: 1, caloriesPer100g: protein * 4 + 9, isLiquid: false,
  nutritionBasis: 'raw', source: 'custom', createdAt: 1, updatedAt: 1, ...extra,
});
const price = (foodId: string, packPrice: number, packG: number, extra: Partial<FoodPrice> = {}): FoodPrice => ({ id: foodId, foodId, packPrice, packG, updatedAt: 1, ...extra });
const item = (id: string, extra: Partial<PantryItem> = {}): PantryItem => ({ id, name: id, createdAt: 1, updatedAt: 1, ...extra });

describe('cost', () => {
  it('converts a pack price to price per kg', () => {
    expect(pricePerKg({ packPrice: 4.5, packG: 500 })).toBeCloseTo(9);
    expect(pricePerKg({ packPrice: 1, packG: 0 })).toBe(0);
    expect(costOfGrams({ packPrice: 4.5, packG: 500 }, 250)).toBeCloseTo(2.25);
  });
  it('protein per euro: chicken at 8 €/kg with 22 g/100 g', () => {
    const v = proteinValue({ proteinPer100g: 22 }, { packPrice: 8, packG: 1000 })!;
    // 1 kg = 220 g protein for 8 € → 0.03636 €/g → 0.727 € per 20 g
    expect(v.perGramProtein).toBeCloseTo(8 / 220, 6);
    expect(v.per20g).toBeCloseTo(0.727, 3);
    expect(v.gramsPerCurrency).toBeCloseTo(27.5, 6);
  });
  it('ignores foods with no real protein and zero prices', () => {
    expect(proteinValue({ proteinPer100g: 0.4 }, { packPrice: 1, packG: 100 })).toBeNull();
    expect(proteinValue({ proteinPer100g: 20 }, { packPrice: 0, packG: 100 })).toBeNull();
  });
  it('ranks cheapest protein first and skips deleted prices / unknown foods', () => {
    const foods = new Map([food('whey', 80), food('chicken', 22), food('oil', 0)].map(f => [f.id, f]));
    const rows = rankByValue(
      [price('chicken', 8, 1000), price('whey', 30, 1000), price('oil', 5, 1000), price('ghost', 1, 100), price('whey2', 1, 1, { deletedAt: 5 })],
      id => foods.get(id),
    );
    expect(rows.map(r => r.food.id)).toEqual(['chicken', 'whey']); // chicken 8/220 = 0.0364 €/g protein, whey 30/800 = 0.0375
  });
  it('formats money', () => {
    expect(fmtMoney(2.5)).toBe('€2.50');
    expect(fmtMoney(0.727, '$')).toBe('$0.73');
  });
  it('recipe cost: only priced ingredients count and the missing ones are named', () => {
    const recipe = {
      ingredients: [
        { id: 'a', foodId: 'chicken', name: 'Chicken', rawWeightG: 1000, per100g: z, contribution: z, nutritionBasis: 'raw' as const },
        { id: 'b', foodId: 'rice', name: 'Rice', rawWeightG: 500, per100g: z, contribution: z, nutritionBasis: 'raw' as const },
        { id: 'c', name: 'Homemade sauce', rawWeightG: 100, per100g: z, contribution: z, nutritionBasis: 'raw' as const },
      ],
      cookedTotalWeightG: 1750, totals: { ...z, protein: 250 },
    };
    const prices = new Map([['chicken', price('chicken', 8, 1000)], ['rice', price('rice', 2, 1000)]]);
    const c = recipeCost(recipe, id => prices.get(id));
    expect(c.total).toBeCloseTo(8 + 1);
    expect(c.priced).toBe(2);
    expect(c.missing).toEqual(['Homemade sauce']);
    expect(c.per100Cooked).toBeCloseTo((9 / 1750) * 100, 6);
    expect(c.per20gProtein).toBeCloseTo((9 / 250) * 20, 6);
    expect(portionCost(c, 350)).toBeCloseTo(1.8, 6); // 20 % of the batch
    expect(recipeCost(recipe, id => prices.get(id), 2).total).toBeCloseTo(18);
    expect(recipeCost(recipe, () => undefined).per100Cooked).toBeNull();
  });
});

describe('pack sizes', () => {
  it.each([
    ['500 g', 500], ['1 kg', 1000], ['1,5 kg', 1500], ['2 x 125 g', 250], ['6 × 330 ml', 1980], ['1 L', 1000], ['75 cl', 750], ['Net wt 454g', 454],
  ])('parses %s', (label, grams) => expect(parsePackGrams(label)).toBe(grams));
  it('returns undefined for junk', () => {
    expect(parsePackGrams('')).toBeUndefined();
    expect(parsePackGrams(undefined)).toBeUndefined();
    expect(parsePackGrams('a pinch')).toBeUndefined();
  });
  it('Open Food Facts products carry the pack size and become complete foods', () => {
    const p = parseOffProduct({ code: '123456789012', product_name: 'Skyr', brands: 'Arla', quantity: '450 g', nutriments: { proteins_100g: 11, carbohydrates_100g: 4, fat_100g: 0.2, 'energy-kcal_100g': 63 } })!;
    expect(p.packG).toBe(450);
    const f = foodFromOffProduct(p, 'food-1', 5);
    expect(f).toMatchObject({ id: 'food-1', name: 'Skyr', brand: 'Arla', barcode: '123456789012', source: 'imported', nutritionBasis: 'as-packaged', proteinPer100g: 11 });
  });
});

describe('barcodes & fridge lookups', () => {
  it('UPC-A and EAN-13 with a leading zero are the same product', () => {
    expect(normCode('0012345678905')).toBe(normCode('012345678905'));
    const pantry = [item('p', { barcode: '012345678905' })];
    expect(pantryItemForBarcode(pantry, '0012345678905')?.id).toBe('p');
    expect(pantryItemForBarcode([item('p', { barcode: '1', deletedAt: 9 })], '1')).toBeUndefined();
  });
  it('have: sums known amounts; an item without an amount means "I have it"', () => {
    const m = haveByKey([item('a', { foodId: 'chicken', amountG: 300 }), item('b', { foodId: 'chicken', amountG: 200 }), item('c', { foodId: 'rice' }), item('d', { name: 'Tofu', deletedAt: 3 }), item('e', { name: 'Mystery Sauce' })]);
    expect(m.get('chicken')).toEqual({ grams: 500, unknown: false });
    expect(m.get('rice')).toEqual({ grams: 0, unknown: true });
    expect(m.has('name:tofu')).toBe(false);
    expect(m.get('name:mystery sauce')?.unknown).toBe(true);
  });
});

describe('resolveBarcode', () => {
  const product: OffProduct = { code: '3017620422003', name: 'Hazelnut spread', proteinPer100g: 6, carbsPer100g: 57, fatPer100g: 31, caloriesPer100g: 539 };
  const base = (over: Partial<ScanDeps> = {}): ScanDeps => ({ pantry: [], foods: [], lookup: async () => product, lookupEnabled: true, online: true, ...over });
  it('rejects short codes', async () => expect(await resolveBarcode('12', base())).toMatchObject({ kind: 'unidentified', reason: 'invalid' }));
  it('already in the fridge wins (no lookup)', async () => {
    let called = false;
    const out = await resolveBarcode('3017620422003', base({ pantry: [item('p', { barcode: '3017620422003' })], lookup: async () => { called = true; return product; } }));
    expect(out.kind).toBe('already'); expect(called).toBe(false);
  });
  it('uses a food you already have with that barcode before going online', async () => {
    let called = false;
    const out = await resolveBarcode('3017620422003', base({ foods: [food('mine', 5, { barcode: '3017620422003' })], lookup: async () => { called = true; return product; } }));
    expect(out).toMatchObject({ kind: 'known', food: { id: 'mine' } }); expect(called).toBe(false);
  });
  it('looks the product up online', async () => expect(await resolveBarcode('3017620422003', base())).toMatchObject({ kind: 'identified', product: { name: 'Hazelnut spread' } }));
  it('never blocks: offline / disabled / not found all return "unidentified" with a reason', async () => {
    expect(await resolveBarcode('3017620422003', base({ online: false }))).toMatchObject({ kind: 'unidentified', reason: 'offline' });
    expect(await resolveBarcode('3017620422003', base({ lookupEnabled: false }))).toMatchObject({ kind: 'unidentified', reason: 'disabled' });
    expect(await resolveBarcode('3017620422003', base({ lookup: async () => { throw new OffError('not-found', 'No product found for that barcode.'); } }))).toMatchObject({ kind: 'unidentified', reason: 'not-found' });
    expect(await resolveBarcode('3017620422003', base({ lookup: async () => { throw new Error('boom'); } }))).toMatchObject({ kind: 'unidentified', reason: 'error' });
  });
});

// ------------------------------------------------------------------ plan & shopping list
const ing = (foodId: string | undefined, name: string, rawWeightG: number) => ({ id: `${name}-${rawWeightG}`, ...(foodId ? { foodId } : {}), name, rawWeightG, per100g: z, contribution: z, nutritionBasis: 'raw' as const });
const recipe = (id: string, ingredients: Recipe['ingredients'], protein = 100): Recipe => ({
  id, name: id, ingredients, rawTotalWeightG: 1, totals: { ...z, protein, calories: protein * 5 }, per100Raw: z, portionSizesG: [], createdAt: 1, updatedAt: 1,
});
const foods = new Map([food('chicken', 22), food('rice', 7, { category: 'carb' }), food('skyr', 11, { category: 'dairy' }), food('oats', 13, { category: 'carb' })].map(f => [f.id, f]));
const bowl = recipe('bowl', [ing('chicken', 'chicken', 1000), ing('rice', 'rice', 500), ing(undefined, 'Homemade sauce', 100)], 250);
const oats = recipe('oats', [ing('oats', 'oats', 200), ing('skyr', 'skyr', 300)], 60);
const recipes = new Map([bowl, oats].map(r => [r.id, r]));
const prices = new Map([price('chicken', 8, 1000), price('rice', 2, 1000), price('skyr', 1.5, 450)].map(p => [p.foodId, p]));
const look: PlanLookups = { recipeOf: id => recipes.get(id), foodOf: id => foods.get(id), priceOf: id => prices.get(id) };
const line = (id: string, extra: Partial<PlanLine>): PlanLine => ({ id, week: '2026-11-16', name: id, createdAt: 1, updatedAt: 1, ...extra });

describe('weekly plan', () => {
  it('adding the same recipe/food again increases the line instead of duplicating it', () => {
    let n = 0; const mk = () => `new${++n}`;
    const first = upsertPlanLine([], '2026-11-16', { recipeId: 'bowl', name: 'Bowl' }, 10, mk);
    expect(first).toMatchObject({ id: 'new1', batches: 1, recipeId: 'bowl' });
    const again = upsertPlanLine([first], '2026-11-16', { recipeId: 'bowl', name: 'Bowl', batches: 2 }, 11, mk);
    expect(again).toMatchObject({ id: 'new1', batches: 3 });
    const otherWeek = upsertPlanLine([first], '2026-11-23', { recipeId: 'bowl', name: 'Bowl' }, 12, mk);
    expect(otherWeek.id).toBe('new2');
    const food1 = upsertPlanLine([], '2026-11-16', { foodId: 'skyr', name: 'Skyr', grams: 500 }, 10, mk);
    expect(upsertPlanLine([food1], '2026-11-16', { foodId: 'skyr', name: 'Skyr', grams: 250 }, 11, mk)).toMatchObject({ id: food1.id, grams: 750 });
  });
  it('copying a week skips lines already present and deleted ones', () => {
    const lines = [line('a', { recipeId: 'bowl' }), line('b', { recipeId: 'oats' }), line('c', { foodId: 'skyr', grams: 500 }), line('d', { recipeId: 'x', deletedAt: 5 }), line('e', { week: '2026-11-23', recipeId: 'oats' })];
    expect(linesToCopy(lines, '2026-11-16', '2026-11-23').map(l => l.id)).toEqual(['a', 'c']);
  });
  it('totals nutrition and cost; flags what is missing', () => {
    const d = describePlan([line('l1', { recipeId: 'bowl', batches: 2 }), line('l2', { foodId: 'skyr', grams: 450 }), line('l3', { recipeId: 'gone', name: 'Old recipe' })], look);
    expect(d.totals.protein).toBeCloseTo(250 * 2 + 0.11 * 450, 6);
    expect(d.rows[2]).toMatchObject({ missing: true, name: 'Old recipe' });
    // bowl: (8 + 1) × 2 = 18, skyr 450 g = 1.5
    expect(d.cost).toBeCloseTo(19.5);
    expect(d.costComplete).toBe(false); // sauce unpriced + missing recipe
  });
});

describe('shopping list', () => {
  it('sums raw ingredients across batches and recipes', () => {
    const l = buildShoppingList([line('1', { recipeId: 'bowl', batches: 2 }), line('2', { recipeId: 'oats', batches: 1 }), line('3', { foodId: 'skyr', grams: 200 })], [], look);
    const by = Object.fromEntries(l.buy.map(r => [r.key, r]));
    expect(by.chicken.buyG).toBe(2000);
    expect(by.rice.buyG).toBe(1000);
    expect(by.skyr.buyG).toBe(500); // 300 from oats + 200 extra
    expect(by.skyr.from).toEqual(['oats', 'Extra']);
    expect(by['name:homemade sauce'].buyG).toBe(200);
    expect(l.skipped).toEqual([]);
  });
  it('the fridge covers what you have: unknown amount = enough, known amount is subtracted', () => {
    const pantry = [item('p1', { foodId: 'chicken', amountG: 600 }), item('p2', { foodId: 'rice' }), item('p3', { foodId: 'skyr', amountG: 1000 })];
    const l = buildShoppingList([line('1', { recipeId: 'bowl', batches: 2 }), line('2', { recipeId: 'oats' })], pantry, look);
    expect(l.buy.map(r => r.key).sort()).toEqual(['chicken', 'name:homemade sauce', 'oats']);
    expect(l.buy.find(r => r.key === 'chicken')!.buyG).toBe(1400); // 2000 − 600
    expect(l.have.map(r => r.key).sort()).toEqual(['rice', 'skyr']);
    expect(l.have.find(r => r.key === 'rice')!.haveUnknown).toBe(true);
  });
  it('rounds up to whole packs and estimates the cost', () => {
    const l = buildShoppingList([line('1', { recipeId: 'oats', batches: 3 })], [], look);
    const skyr = l.buy.find(r => r.key === 'skyr')!; // 900 g needed, 450 g packs at 1.50
    expect(skyr).toMatchObject({ packG: 450, packs: 2, cost: 3 });
    const chickenOnly = buildShoppingList([line('1', { recipeId: 'bowl' })], [], look);
    expect(chickenOnly.buy.find(r => r.key === 'chicken')).toMatchObject({ packs: 1, cost: 8 });
    expect(chickenOnly.estCost).toBeCloseTo(8 + 2); // chicken 1 pack + rice 1 whole 1 kg pack (500 g needed)
    expect(chickenOnly.unpriced).toBe(1); // homemade sauce
  });
  it('skips plan lines whose recipe was deleted and ignores soft-deleted lines', () => {
    const l = buildShoppingList([line('1', { recipeId: 'gone', name: 'Old recipe' }), line('2', { recipeId: 'oats', deletedAt: 3 })], [], look);
    expect(l.buy).toEqual([]);
    expect(l.skipped).toEqual(['Old recipe']);
  });
  it('orders by category then name and renders text for sharing', () => {
    const l = buildShoppingList([line('1', { recipeId: 'bowl' }), line('2', { recipeId: 'oats' })], [], look);
    expect(l.buy[0].key).toBe('chicken'); // protein first
    const text = shoppingText(l, 'Shopping 16–22 Nov', g => `${g} g`);
    expect(text).toContain('☐ chicken — 1000 g (1 × 1000 g)');
    expect(shoppingText({ ...l, buy: [] }, 't', g => `${g}`)).toContain('Nothing to buy');
  });
});

import { chipName } from './foodNames';
describe('chip names', () => {
  it('drops qualifiers in brackets and trims long names', () => {
    expect(chipName('Chicken breast, raw (skinless)')).toBe('Chicken breast, raw');
    expect(chipName('White rice (long-grain), dry')).toBe('White rice, dry');
    expect(chipName('A very long product name that keeps going and going', 20)).toBe('A very long product…');
  });
});
