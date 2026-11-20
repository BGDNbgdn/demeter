import { describe, expect, it } from 'vitest';
import {
  calculateRecipe, convertMacrosCookedToRaw, convertMacrosRawToCooked, cookedToRawPer100, cookingChange,
  evenPortionG, explainCaloriesChange, explainCooking, fmtKcal, fmtNum, fmtSmart, makeMacros, nutritionForWeight,
  per100FromTotals, portionNutrition, rawToCookedPer100, remainingBatch, resolveCooking, roundTo, sumMacros,
} from './index';

// Raw chicken from the brief: 20 g protein and 110 kcal per 100 g raw.
const chicken = makeMacros({ protein: 20, calories: 110, fat: 2, carbs: 0 });

describe('scalar formulas', () => {
  it('chicken example: 20 g protein → 25 g per 100 g cooked after losing 200 g', () => {
    expect(rawToCookedPer100(20, 1000, 800)).toBeCloseTo(25, 10);
    expect(rawToCookedPer100(110, 1000, 800)).toBeCloseTo(137.5, 10);
  });

  it('reverse calculation returns the original raw density', () => {
    const cooked = rawToCookedPer100(20, 1000, 800)!;
    expect(cookedToRawPer100(cooked, 1000, 800)).toBeCloseTo(20, 10);
    expect(cookedToRawPer100(137.5, 1000, 800)).toBeCloseTo(110, 10);
  });

  it('round trip is lossless for arbitrary weights', () => {
    for (const [raw, cooked] of [[333, 217], [1, 0.7], [2500, 4100], [87.3, 87.3]]) {
      const c = rawToCookedPer100(17.3, raw, cooked)!;
      expect(cookedToRawPer100(c, raw, cooked)).toBeCloseTo(17.3, 9);
    }
  });

  it('returns null instead of dividing by zero or accepting garbage', () => {
    expect(rawToCookedPer100(20, 1000, 0)).toBeNull();
    expect(rawToCookedPer100(20, 0, 800)).toBeNull();
    expect(rawToCookedPer100(20, 1000, -5)).toBeNull();
    expect(rawToCookedPer100(20, 1000, NaN)).toBeNull();
    expect(rawToCookedPer100(20, Infinity, 800)).toBeNull();
    expect(cookedToRawPer100(25, 1000, 0)).toBeNull();
    expect(rawToCookedPer100(NaN, 1000, 800)).toBeNull();
  });
});

describe('macros conversion', () => {
  it('converts every nutrient', () => {
    const c = convertMacrosRawToCooked(chicken, 1000, 800)!;
    expect(c.protein).toBeCloseTo(25);
    expect(c.calories).toBeCloseTo(137.5);
    expect(c.fat).toBeCloseTo(2.5);
    const back = convertMacrosCookedToRaw(c, 1000, 800)!;
    expect(back.protein).toBeCloseTo(20);
    expect(back.calories).toBeCloseTo(110);
  });
  it('null for invalid weights', () => {
    expect(convertMacrosRawToCooked(chicken, 0, 800)).toBeNull();
    expect(convertMacrosCookedToRaw(chicken, 1000, 0)).toBeNull();
  });
});

describe('cookingChange', () => {
  it('computes loss %, retention %, and density increase', () => {
    const c = cookingChange(1000, 800)!;
    expect(c.lossPct).toBeCloseTo(20);
    expect(c.retentionPct).toBeCloseTo(80);
    expect(c.weightChangeG).toBe(-200);
    expect(c.direction).toBe('loss');
    expect(c.densityFactor).toBeCloseTo(1.25);
    expect(c.densityChangePct).toBeCloseTo(25);
  });
  it('equal weights: no change, no concentration adjustment', () => {
    const c = cookingChange(500, 500)!;
    expect(c.direction).toBe('none');
    expect(c.lossPct).toBe(0);
    expect(c.densityFactor).toBe(1);
    expect(c.densityChangePct).toBe(0);
  });
  it('cooked heavier than raw is allowed (rice absorbs water)', () => {
    const c = cookingChange(100, 280)!;
    expect(c.direction).toBe('gain');
    expect(c.retentionPct).toBeCloseTo(280);
    expect(c.lossPct).toBeCloseTo(-180);
    expect(c.densityFactor).toBeCloseTo(100 / 280);
  });
  it('null for invalid input', () => {
    expect(cookingChange(0, 100)).toBeNull();
    expect(cookingChange(100, 0)).toBeNull();
    expect(cookingChange(100, NaN)).toBeNull();
  });
});

describe('resolveCooking — the user scenarios', () => {
  it('1) raw weight only: no adjustment, cooked density equals raw density', () => {
    const r = resolveCooking({ basis: 'raw', per100g: chicken, rawWeightG: 1000 });
    expect(r.status).toBe('raw-only');
    expect(r.per100Cooked).toEqual(chicken);
    expect(r.change).toBeNull();
    expect(r.errors).toHaveLength(0);
  });

  it('2) raw + cooked weight + raw nutrition: the headline chicken example', () => {
    const r = resolveCooking({ basis: 'raw', per100g: chicken, rawWeightG: 1000, cookedWeightG: 800, label: 'Chicken' });
    expect(r.status).toBe('converted');
    expect(r.per100Cooked!.protein).toBeCloseTo(25);
    expect(r.per100Cooked!.calories).toBeCloseTo(137.5);
    expect(r.change!.lossPct).toBeCloseTo(20);
    expect(r.explanation).toBe(
      'Chicken lost 20% of its weight during cooking. Protein density increased from 20 g to 25 g per 100 g.',
    );
    // eating 300 g of the cooked chicken:
    const eaten = nutritionForWeight(r.per100Cooked!, 300);
    expect(eaten.protein).toBeCloseTo(75);
    expect(eaten.calories).toBeCloseTo(412.5);
  });

  it('3) only cooked weight and nutrition per 100 g cooked', () => {
    const cooked = makeMacros({ protein: 31, calories: 165 });
    const r = resolveCooking({ basis: 'cooked', per100g: cooked, cookedWeightG: 800 });
    expect(r.status).toBe('cooked-only');
    expect(r.per100Cooked).toEqual(cooked);
    expect(r.per100Raw).toBeNull();
    expect(r.errors).toHaveLength(0);
  });

  it('3b) cooked-basis nutrition + both weights recovers the raw density (reverse)', () => {
    const r = resolveCooking({ basis: 'cooked', per100g: makeMacros({ protein: 25, calories: 137.5 }), rawWeightG: 1000, cookedWeightG: 800 });
    expect(r.status).toBe('converted');
    expect(r.per100Raw!.protein).toBeCloseTo(20);
    expect(r.per100Raw!.calories).toBeCloseTo(110);
  });

  it('4) cooked weight but forgot raw weight: uses the food default retention', () => {
    const r = resolveCooking({ basis: 'raw', per100g: chicken, cookedWeightG: 750, defaultRetentionPercent: 75 });
    expect(r.status).toBe('estimated-raw');
    expect(r.rawWeightG).toBeCloseTo(1000);
    expect(r.per100Cooked!.protein).toBeCloseTo(26.6667, 3);
    expect(r.warnings.some(w => w.code === 'estimated-raw')).toBe(true);
  });

  it('4b) cooked weight, no raw weight and no default retention → helpful error', () => {
    const r = resolveCooking({ basis: 'raw', per100g: chicken, cookedWeightG: 750 });
    expect(r.status).toBe('invalid');
    expect(r.errors[0].code).toBe('missing-raw-weight');
    expect(r.per100Cooked).toBeNull();
  });

  it('5) raw equals cooked: no concentration adjustment', () => {
    const r = resolveCooking({ basis: 'raw', per100g: chicken, rawWeightG: 500, cookedWeightG: 500, label: 'Salad' });
    expect(r.status).toBe('converted');
    expect(r.per100Cooked).toEqual(chicken);
    expect(r.change!.direction).toBe('none');
    expect(r.warnings).toHaveLength(0);
    expect(r.explanation).toContain('did not change weight');
  });

  it('6) cooked heavier than raw is allowed but warns, and density drops', () => {
    const rice = makeMacros({ protein: 7, calories: 365, carbs: 80 });
    const r = resolveCooking({ basis: 'raw', per100g: rice, rawWeightG: 100, cookedWeightG: 280, label: 'Rice' });
    expect(r.status).toBe('converted');
    expect(r.warnings.some(w => w.code === 'cooked-heavier')).toBe(true);
    expect(r.per100Cooked!.calories).toBeCloseTo(130.357, 2);
    expect(r.errors).toHaveLength(0);
    expect(r.explanation).toBe('Rice gained 180% weight during cooking (it absorbed water or oil). Protein density decreased from 7 g to 2.5 g per 100 g.');
  });

  it('7) zero / negative / NaN cooked weight is prevented with a helpful error', () => {
    for (const bad of [0, -10, NaN, Infinity]) {
      const r = resolveCooking({ basis: 'raw', per100g: chicken, rawWeightG: 1000, cookedWeightG: bad });
      expect(r.status).toBe('invalid');
      expect(r.errors.some(e => e.code === 'invalid-cooked-weight')).toBe(true);
      expect(r.per100Cooked).toBeNull();
    }
  });

  it('7b) invalid raw weight is reported', () => {
    const r = resolveCooking({ basis: 'raw', per100g: chicken, rawWeightG: 0, cookedWeightG: 100 });
    expect(r.status).toBe('invalid');
    expect(r.errors[0].code).toBe('invalid-raw-weight');
  });

  it('7c) no weights at all', () => {
    const r = resolveCooking({ basis: 'raw', per100g: chicken });
    expect(r.status).toBe('invalid');
    expect(r.errors[0].code).toBe('missing-weights');
  });

  it('8) very small cooked weights keep full internal precision', () => {
    const r = resolveCooking({ basis: 'raw', per100g: makeMacros({ protein: 3, calories: 40 }), rawWeightG: 1, cookedWeightG: 0.3 });
    expect(r.per100Cooked!.protein).toBeCloseTo(10, 10);
    expect(r.per100Cooked!.calories).toBeCloseTo(133.3333333, 6);
    expect(r.warnings.some(w => w.code === 'tiny-weight')).toBe(true);
  });

  it('9) extreme weight loss is flagged', () => {
    const r = resolveCooking({ basis: 'raw', per100g: chicken, rawWeightG: 1000, cookedWeightG: 50 });
    expect(r.warnings.some(w => w.code === 'extreme-loss')).toBe(true);
  });

  it('as-packaged nutrition is converted like raw', () => {
    const r = resolveCooking({ basis: 'as-packaged', per100g: makeMacros({ protein: 10, calories: 200 }), rawWeightG: 200, cookedWeightG: 100 });
    expect(r.per100Cooked!.protein).toBeCloseTo(20);
  });

  it('calories explanation helper', () => {
    expect(explainCaloriesChange(makeMacros({ calories: 110 }), makeMacros({ calories: 137.5 }))).toBe('Calories rose from 110 to 137.5 kcal per 100 g.');
    expect(explainCaloriesChange(makeMacros({ calories: 365 }), makeMacros({ calories: 130 }))).toBe('Calories fell from 365 to 130 kcal per 100 g.');
  });

  it('explainCooking handles loss and no-change directly', () => {
    const change = cookingChange(1000, 800)!;
    expect(explainCooking({ label: 'Chicken', change, per100Raw: chicken, per100Cooked: makeMacros({ protein: 25 }) })).toMatch(/lost 20% of its weight/);
  });
});

describe('recipes', () => {
  // Brief: 1000 g chicken, 1000 g potatoes, 50 g olive oil, 100 g sauce, 1750 g cooked
  const ingredients = [
    { name: 'Chicken', per100g: makeMacros({ protein: 20, carbs: 0, fat: 2, calories: 110 }), rawWeightG: 1000 },
    { name: 'Potato', per100g: makeMacros({ protein: 2, carbs: 17, fat: 0.1, calories: 77 }), rawWeightG: 1000 },
    { name: 'Olive oil', per100g: makeMacros({ protein: 0, carbs: 0, fat: 100, calories: 884 }), rawWeightG: 50 },
    { name: 'Sauce', per100g: makeMacros({ protein: 1, carbs: 10, fat: 5, calories: 100 }), rawWeightG: 100 },
  ];

  it('sums totals and derives per-100 g raw and cooked values', () => {
    const r = calculateRecipe({ ingredients, cookedTotalWeightG: 1750 });
    expect(r.status).toBe('cooked');
    expect(r.rawTotalWeightG).toBe(2150);
    expect(r.cookedTotalWeightG).toBe(1750);
    expect(r.totals.protein).toBeCloseTo(221);
    expect(r.totals.calories).toBeCloseTo(1100 + 770 + 442 + 100);
    expect(r.per100Raw.protein).toBeCloseTo((221 / 2150) * 100, 8);
    expect(r.per100Cooked!.protein).toBeCloseTo((221 / 1750) * 100, 8);
    expect(r.per100Cooked!.calories).toBeCloseTo((2412 / 1750) * 100, 8);
    expect(r.change!.lossPct).toBeCloseTo(((2150 - 1750) / 2150) * 100, 8);
  });

  it('a 350 g portion of the 1,750 g dish is exactly 20% of the totals', () => {
    const r = calculateRecipe({ ingredients, cookedTotalWeightG: 1750 });
    const p = portionNutrition(r, 350);
    expect(p.protein).toBeCloseTo(221 * 0.2, 8);
    expect(p.calories).toBeCloseTo(2412 * 0.2, 8);
    expect(p.fat).toBeCloseTo((r.totals.fat) * 0.2, 8);
  });

  it('single ingredient recipe equals the single-food chicken example', () => {
    const r = calculateRecipe({ ingredients: [{ per100g: chicken, rawWeightG: 1000 }], cookedTotalWeightG: 800 });
    expect(r.per100Cooked!.protein).toBeCloseTo(25);
    const p = portionNutrition(r, 300);
    expect(p.protein).toBeCloseTo(75);
    expect(p.calories).toBeCloseTo(412.5);
    expect(r.explanation).toContain('lost 20% of its weight');
    expect(r.explanation).toContain('from 20 g to 25 g');
  });

  it('oil added during cooking is just another ingredient and dilutes protein, not calories', () => {
    const noOil = calculateRecipe({ ingredients: [ingredients[0]], cookedTotalWeightG: 800 });
    const withOil = calculateRecipe({ ingredients: [ingredients[0], ingredients[2]], cookedTotalWeightG: 850 });
    expect(withOil.totals.protein).toBeCloseTo(noOil.totals.protein);
    expect(withOil.totals.calories).toBeCloseTo(noOil.totals.calories + 442);
    expect(withOil.per100Cooked!.protein).toBeCloseTo((200 / 850) * 100, 8);
    expect(withOil.per100Cooked!.fat).toBeGreaterThan(noOil.per100Cooked!.fat);
  });

  it('water absorbed during cooking: cooked heavier than raw → allowed with warning', () => {
    const rice = { name: 'Rice', per100g: makeMacros({ protein: 7, carbs: 80, calories: 365 }), rawWeightG: 200 };
    const r = calculateRecipe({ ingredients: [rice], cookedTotalWeightG: 560 });
    expect(r.status).toBe('cooked');
    expect(r.change!.direction).toBe('gain');
    expect(r.warnings.some(w => w.code === 'cooked-heavier')).toBe(true);
    expect(r.per100Cooked!.calories).toBeCloseTo((730 / 560) * 100, 8);
    expect(r.errors).toHaveLength(0);
  });

  it('no cooked weight yet: raw-only, portions fall back to raw density', () => {
    const r = calculateRecipe({ ingredients });
    expect(r.status).toBe('raw-only');
    expect(r.per100Cooked).toBeNull();
    expect(r.cookedWeightSource).toBe('none');
    expect(portionNutrition(r, 100).protein).toBeCloseTo(r.per100Raw.protein);
  });

  it('cooked total can be derived from per-ingredient cooked weights', () => {
    const r = calculateRecipe({
      ingredients: [
        { ...ingredients[0], cookedWeightG: 750 },
        { ...ingredients[1], cookedWeightG: 900 },
      ],
    });
    expect(r.cookedWeightSource).toBe('sum-of-ingredients');
    expect(r.cookedTotalWeightG).toBe(1650);
    expect(r.ingredients[0].per100Cooked!.protein).toBeCloseTo((20 * 1000) / 750);
    expect(r.ingredients[0].change!.lossPct).toBeCloseTo(25);
  });

  it('an entered total wins over the sum of ingredient weights', () => {
    const r = calculateRecipe({
      ingredients: [{ ...ingredients[0], cookedWeightG: 750 }, { ...ingredients[1], cookedWeightG: 900 }],
      cookedTotalWeightG: 1600,
    });
    expect(r.cookedWeightSource).toBe('entered');
    expect(r.cookedTotalWeightG).toBe(1600);
  });

  it('empty recipe', () => {
    const r = calculateRecipe({ ingredients: [] });
    expect(r.status).toBe('empty');
    expect(r.rawTotalWeightG).toBe(0);
    expect(r.per100Raw).toEqual(makeMacros());
    expect(r.errors).toHaveLength(0);
  });

  it('zero cooked total is rejected without dividing by zero', () => {
    const r = calculateRecipe({ ingredients, cookedTotalWeightG: 0 });
    expect(r.errors.some(e => e.code === 'invalid-cooked-weight')).toBe(true);
    expect(r.per100Cooked).toBeNull();
    expect(Number.isFinite(r.per100Raw.protein)).toBe(true);
  });

  it('negative / NaN ingredient weights are excluded and reported', () => {
    const r = calculateRecipe({ ingredients: [{ name: 'Bad', per100g: chicken, rawWeightG: -5 }, ingredients[1]], cookedTotalWeightG: 900 });
    expect(r.errors).toHaveLength(1);
    expect(r.rawTotalWeightG).toBe(1000);
    const r2 = calculateRecipe({ ingredients: [{ per100g: chicken, rawWeightG: NaN }], cookedTotalWeightG: 100 });
    expect(r2.errors).toHaveLength(1);
    expect(r2.status).toBe('invalid');
  });

  it('blank (null) ingredient weights contribute nothing and are not errors', () => {
    const r = calculateRecipe({ ingredients: [{ per100g: chicken, rawWeightG: null }, ingredients[1]] });
    expect(r.errors).toHaveLength(0);
    expect(r.rawTotalWeightG).toBe(1000);
  });

  it('zero-weight ingredient contributes nothing', () => {
    const r = calculateRecipe({ ingredients: [{ per100g: chicken, rawWeightG: 0 }, ingredients[1]], cookedTotalWeightG: 900 });
    expect(r.totals.protein).toBeCloseTo(20);
  });

  it('tracks remaining portions of a batch', () => {
    const info = remainingBatch(1750, 700, 350)!;
    expect(info.remainingG).toBe(1050);
    expect(info.portionsLeft).toBeCloseTo(3);
    expect(remainingBatch(1750, 2000, 350)!.overEaten).toBe(true);
    expect(remainingBatch(1750, 2000, 350)!.remainingG).toBe(0);
    expect(remainingBatch(undefined, 0)).toBeNull();
    expect(evenPortionG(1750, 5)).toBe(350);
    expect(evenPortionG(0, 5)).toBeNull();
  });
});

describe('nutrition helpers', () => {
  it('nutritionForWeight scales per-100 g values', () => {
    expect(nutritionForWeight(chicken, 250).protein).toBeCloseTo(50);
    expect(nutritionForWeight(chicken, 0).protein).toBe(0);
    expect(nutritionForWeight(chicken, -5).protein).toBe(0);
    expect(nutritionForWeight(chicken, NaN).calories).toBe(0);
  });
  it('per100FromTotals guards zero weight', () => {
    expect(per100FromTotals(chicken, 0)).toEqual(makeMacros());
    expect(per100FromTotals(makeMacros({ protein: 50 }), 200).protein).toBeCloseTo(25);
  });
  it('sumMacros', () => {
    expect(sumMacros([makeMacros({ protein: 1, calories: 10 }), makeMacros({ protein: 2.5, calories: 5 })])).toEqual(makeMacros({ protein: 3.5, calories: 15 }));
    expect(sumMacros([])).toEqual(makeMacros());
  });
});

describe('rounding behaviour', () => {
  it('roundTo is half-away-from-zero and float-safe', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(2.5, 0)).toBe(3);
    expect(roundTo(-2.5, 0)).toBe(-3);
    expect(roundTo(412.5, 0)).toBe(413);
    expect(roundTo(137.45, 1)).toBe(137.5);
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3);
    expect(roundTo(NaN)).toBe(0);
    expect(Object.is(roundTo(-0.0004, 2), -0)).toBe(false);
  });
  it('fmtNum trims trailing zeros', () => {
    expect(fmtNum(25)).toBe('25');
    expect(fmtNum(137.5)).toBe('137.5');
    expect(fmtNum(412.5)).toBe('412.5');
    expect(fmtNum(0.04, 2)).toBe('0.04');
    expect(fmtNum(1234.56, 0)).toBe('1,235');
    expect(fmtNum(NaN)).toBe('–');
  });
  it('fmtSmart picks sensible precision', () => {
    expect(fmtSmart(0.04)).toBe('0.04');
    expect(fmtSmart(3.456)).toBe('3.5');
    expect(fmtSmart(25)).toBe('25');
    expect(fmtSmart(137.5, { detail: true })).toBe('137.5');
    expect(fmtSmart(1432.6)).toBe('1,433');
    expect(fmtSmart(0)).toBe('0');
  });
  it('fmtKcal shows 412.5 in detail but whole numbers in lists', () => {
    expect(fmtKcal(412.5, true)).toBe('412.5');
    expect(fmtKcal(412.5)).toBe('413');
  });
  it('internal precision is preserved even when displayed rounded', () => {
    const r = resolveCooking({ basis: 'raw', per100g: makeMacros({ protein: 3, calories: 40 }), rawWeightG: 1, cookedWeightG: 0.3 });
    expect(r.per100Cooked!.calories).not.toBe(133.3);
    expect(fmtNum(r.per100Cooked!.calories, 1)).toBe('133.3');
  });
});
