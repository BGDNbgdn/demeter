import { describe, expect, it } from 'vitest';
import { BUILTIN_FOODS } from './index';
import { FOOD_CATEGORIES } from '../types';
import { createFoodSearcher } from '../lib/search';

describe('bundled food database', () => {
  it('has at least 600 foods with unique ids', () => {
    expect(BUILTIN_FOODS.length).toBeGreaterThanOrEqual(600);
    expect(new Set(BUILTIN_FOODS.map(f => f.id)).size).toBe(BUILTIN_FOODS.length);
  });

  it('every food has plausible, complete nutrition', () => {
    for (const f of BUILTIN_FOODS) {
      const ctx = `${f.id} ${f.name}`;
      expect(f.name.length, ctx).toBeGreaterThan(1);
      expect(FOOD_CATEGORIES, ctx).toContain(f.category);
      for (const k of ['proteinPer100g', 'carbsPer100g', 'fatPer100g', 'caloriesPer100g'] as const) {
        expect(Number.isFinite(f[k]), `${ctx} ${k}`).toBe(true);
        expect(f[k], `${ctx} ${k}`).toBeGreaterThanOrEqual(0);
      }
      expect(f.caloriesPer100g, ctx).toBeLessThanOrEqual(905);
      // macros can't weigh more than the food (a little slack for rounding / fibre double counting)
      expect(f.proteinPer100g + f.carbsPer100g + f.fatPer100g, ctx).toBeLessThanOrEqual(104);
      expect(['raw', 'cooked', 'as-packaged'], ctx).toContain(f.nutritionBasis);
      if (f.defaultCookedWeightRetentionPercent != null) {
        expect(f.defaultCookedWeightRetentionPercent, ctx).toBeGreaterThan(20);
        expect(f.defaultCookedWeightRetentionPercent, ctx).toBeLessThan(700);
      }
      // energy sanity (Atwater tolerance for foods > 50 kcal, liquids/alcohol/fibre excluded)
      if (f.caloriesPer100g > 50 && !f.isLiquid && f.category !== 'beverage') {
        // fibre counts ~2 kcal/g (not 4) in USDA's energy values
        const fib = f.fiberPer100g ?? 0;
        const atw = 4 * f.proteinPer100g + 4 * Math.max(0, f.carbsPer100g - fib) + 2 * fib + 9 * f.fatPer100g;
        expect(Math.abs(atw - f.caloriesPer100g) / f.caloriesPer100g, `${ctx} kcal ${f.caloriesPer100g} vs ${atw}`).toBeLessThan(fib >= 10 ? 0.6 : 0.45);
      }
    }
  });

  it('covers the required protein sources, with raw and cooked variants', () => {
    const names = BUILTIN_FOODS.map(f => f.name.toLowerCase());
    const has = (re: RegExp) => names.some(n => re.test(n));
    for (const re of [
      /chicken breast, raw/, /chicken breast, grilled/, /chicken breast, roasted/, /chicken breast, boiled/, /chicken breast, pan-fried/,
      /chicken thigh, raw/, /chicken thigh, roasted/, /turkey breast, raw/, /turkey mince/, /beef mince 90%/, /ribeye/, /meatballs/,
      /pork loin/, /bacon/, /lamb/, /salmon/, /tuna/, /cod/, /haddock/, /sardines/, /mackerel/, /sea bass/, /shrimp/, /mussels/, /squid/,
      /egg, whole, raw/, /egg white/, /hard-boiled/, /fried/, /omelette/, /greek yogurt/, /skyr/, /cottage cheese/, /quark/, /whole milk/,
      /cheddar/, /mozzarella/, /feta/, /tofu/, /tempeh/, /seitan/, /edamame/, /lentils/, /chickpeas/, /black beans/, /kidney beans/, /green peas/,
      /whey/, /casein/, /vegan protein/, /protein bar/, /protein shake/,
      /potato/, /sweet potato/, /rice/, /pasta/, /bread/, /wrap|tortilla/, /oats|oatmeal/, /quinoa/, /couscous/, /noodles/, /corn flakes|cereal|muesli/,
      /olive oil/, /butter/, /ghee/, /avocado/, /almonds/, /seeds/, /peanut butter/, /tahini/,
      /ketchup/, /mayonnaise, regular/, /mayonnaise, light/, /bbq/, /soy sauce/, /teriyaki/, /sweet chili/, /hot sauce|sriracha/, /pesto/, /curry/, /tomato pasta sauce/, /mustard/, /ranch/, /caesar/, /vinaigrette/,
      /^water$/, /^coffee/, /black tea/, /oat milk/, /almond milk/, /orange juice/, /cola/, /diet cola/, /beer/, /red wine/, /spirits/,
    ]) {
      expect(has(re), String(re)).toBe(true);
    }
  });

  it('raw items that cook have a default retention', () => {
    const chicken = BUILTIN_FOODS.find(f => f.name === 'Chicken breast, raw (skinless)')!;
    expect(chicken.defaultCookedWeightRetentionPercent).toBe(75);
    expect(chicken.proteinPer100g).toBeCloseTo(22.5, 1);
    const rice = BUILTIN_FOODS.find(f => f.name === 'White rice (long-grain), dry')!;
    expect(rice.defaultCookedWeightRetentionPercent).toBeGreaterThan(250);
  });
});

describe('food search', () => {
  const s = createFoodSearcher(BUILTIN_FOODS);
  it('finds by name, alias and brand-less synonyms', () => {
    expect(s.search('chicken breast')[0].name).toMatch(/chicken breast/i);
    expect(s.search('ground beef').some(f => /beef mince/i.test(f.name))).toBe(true);
    expect(s.search('yoghurt').some(f => /yogurt/i.test(f.name))).toBe(true);
    expect(s.search('whey').some(f => /whey/i.test(f.name))).toBe(true);
  });
  it('is fuzzy (typos)', () => {
    expect(s.search('chiken brest').some(f => /chicken breast/i.test(f.name))).toBe(true);
    expect(s.search('brocoli').some(f => /broccoli/i.test(f.name))).toBe(true);
    expect(s.search('salmom').some(f => /salmon/i.test(f.name))).toBe(true);
  });
  it('filters by category, protein density and calories', () => {
    expect(s.search('', { category: 'dairy' }, 'relevance', 500).every(f => f.category === 'dairy')).toBe(true);
    const dense = s.search('', { minProteinPer100kcal: 15 }, 'proteinDensity', 500);
    expect(dense.length).toBeGreaterThan(5);
    expect(dense.every(f => (f.proteinPer100g / f.caloriesPer100g) * 100 >= 15)).toBe(true);
    expect(s.search('', { maxCaloriesPer100g: 50 }, 'relevance', 500).every(f => f.caloriesPer100g <= 50)).toBe(true);
  });
  it('is fast', () => {
    const t = performance.now();
    for (let i = 0; i < 50; i++) s.search('chicken');
    expect(performance.now() - t).toBeLessThan(500);
  });
});
