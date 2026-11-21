import { describe, expect, it } from 'vitest';
import { computeStreaks } from './streak';
import { daysLeftInTrash, purgeExpired, splitLive, TRASH_RETENTION_DAYS } from './trash';
import { applyDrift, calcDraft, describeDrift, emptyDraft, findIngredientDrift, ingredientFromFood, scaleDraft, factorForTarget, type RecipeDraft } from './recipes';
import { defaultSettings, DEFAULT_TARGETS } from '../db/defaults';
import type { AllData, Food, MealLogEntry } from '../types';

const DAY = 86_400_000;
const log = (date: string, protein: number, extra: Partial<MealLogEntry> = {}): MealLogEntry => ({
  id: `l-${date}-${protein}-${Math.random()}`, date, mealType: 'lunch', name: 'x', consumedWeightG: 100, protein, carbs: 0, fat: 0, calories: protein * 4, fiber: 0, createdAt: 1, updatedAt: 1, ...extra,
});
const food = (over: Partial<Food> = {}): Food => ({
  id: 'f1', name: 'My chicken', category: 'custom', proteinPer100g: 20, carbsPer100g: 0, fatPer100g: 2, caloriesPer100g: 110, isLiquid: false,
  nutritionBasis: 'raw', source: 'custom', createdAt: 1, updatedAt: 1, ...over,
});

describe('streak (75% of protein target is all that counts)', () => {
  const T = 160; // 75% = 120 g
  it('counts consecutive days at ≥75% of target', () => {
    const logs = [log('2026-11-18', 120), log('2026-11-19', 130), log('2026-11-20', 125)];
    const s = computeStreaks(logs, T, '2026-11-20');
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(s.todayMet).toBe(true);
    expect(s.atRisk).toBe(false);
  });
  it('119.9 g does not count, 120 g does', () => {
    expect(computeStreaks([log('2026-11-20', 119.9)], T, '2026-11-20').todayMet).toBe(false);
    expect(computeStreaks([log('2026-11-20', 120)], T, '2026-11-20').todayMet).toBe(true);
  });
  it('number of meals is irrelevant: several small entries add up', () => {
    const logs = [log('2026-11-20', 40), log('2026-11-20', 40), log('2026-11-20', 40)];
    expect(computeStreaks(logs, T, '2026-11-20').current).toBe(1);
  });
  it('today in progress does not break the streak; it is flagged at risk', () => {
    const logs = [log('2026-11-18', 130), log('2026-11-19', 130), log('2026-11-20', 30)];
    const s = computeStreaks(logs, T, '2026-11-20');
    expect(s.current).toBe(2);
    expect(s.atRisk).toBe(true);
    expect(s.proteinToGoToday).toBeCloseTo(90);
  });
  it('a missed day resets the current streak but keeps the best', () => {
    const logs = [log('2026-11-10', 130), log('2026-11-11', 130), log('2026-11-12', 130), log('2026-11-13', 50), log('2026-11-14', 130), log('2026-11-15', 130)];
    const s = computeStreaks(logs, T, '2026-11-15');
    expect(s.current).toBe(2);
    expect(s.best).toBe(3);
  });
  it('an empty yesterday ends the streak', () => {
    const s = computeStreaks([log('2026-11-18', 130)], T, '2026-11-20');
    expect(s.current).toBe(0);
    expect(s.best).toBe(1);
    expect(s.atRisk).toBe(false);
  });
  it('ignores deleted entries and zero targets, works across month boundaries', () => {
    expect(computeStreaks([log('2026-11-20', 200, { deletedAt: 5 })], T, '2026-11-20').current).toBe(0);
    expect(computeStreaks([log('2026-11-20', 200)], 0, '2026-11-20').current).toBe(0);
    const s = computeStreaks([log('2026-10-31', 130), log('2026-11-01', 130), log('2026-11-02', 130)], T, '2026-11-02');
    expect(s.current).toBe(3);
  });
});

describe('trash retention', () => {
  const now = 100 * DAY;
  const data = (): AllData => ({
    foods: [food({ id: 'a' }), food({ id: 'b', deletedAt: now - 10 * DAY }), food({ id: 'c', deletedAt: now - 61 * DAY })],
    recipes: [], logs: [log('2026-11-20', 10, { id: 'old', deletedAt: now - 90 * DAY }), log('2026-11-20', 10, { id: 'new', deletedAt: now - 1 * DAY })],
    usage: [], pantry: [], prices: [], plan: [], settings: defaultSettings(), targets: { ...DEFAULT_TARGETS },
  });
  it('removes only soft-deleted records older than the window', () => {
    const { data: out, removed } = purgeExpired(data(), now);
    expect(out.foods.map(f => f.id)).toEqual(['a', 'b']);
    expect(removed.foods).toEqual(['c']);
    expect(out.logs.map(l => l.id)).toEqual(['new']);
    expect(removed.logs).toEqual(['old']);
  });
  it('splits live and trash, and reports days left', () => {
    const { live, trash } = splitLive(data().foods);
    expect(live).toHaveLength(1);
    expect(trash).toHaveLength(2);
    expect(daysLeftInTrash(now - 10 * DAY, now)).toBe(TRASH_RETENTION_DAYS - 10);
    expect(daysLeftInTrash(now - 100 * DAY, now)).toBe(0);
  });
});

describe('recipe scaling', () => {
  const draft = (): RecipeDraft => {
    const d = emptyDraft();
    d.name = 'Bake';
    d.ingredients = [
      { ...ingredientFromFood(food(), 1000) , id: 'i1' },
      { ...ingredientFromFood(food({ id: 'f2', name: 'Oil', proteinPer100g: 0, fatPer100g: 100, caloriesPer100g: 884 }), 50), id: 'i2', cookedWeightG: 48 },
    ];
    d.cookedTotalWeightG = 800;
    d.portionSizesG = [300];
    return d;
  };
  it('×1.5 scales every weight and the cooked total; totals scale; per-100 g values stay identical', () => {
    const before = calcDraft(draft());
    const scaled = scaleDraft(draft(), 1.5);
    expect(scaled.ingredients.map(i => i.rawWeightG)).toEqual([1500, 75]);
    expect(scaled.ingredients[1].cookedWeightG).toBe(72);
    expect(scaled.cookedTotalWeightG).toBe(1200);
    expect(scaled.portionSizesG).toEqual([300]); // a portion is still a portion
    const after = calcDraft(scaled);
    expect(after.totals.protein).toBeCloseTo(before.totals.protein * 1.5, 6);
    expect(after.totals.calories).toBeCloseTo(before.totals.calories * 1.5, 6);
    expect(after.per100Cooked!.protein).toBeCloseTo(before.per100Cooked!.protein, 6);
    expect(after.per100Cooked!.calories).toBeCloseTo(before.per100Cooked!.calories, 6);
  });
  it('rounds to 0.1 g and ignores invalid factors', () => {
    const d = draft(); d.ingredients[0].rawWeightG = 333;
    expect(scaleDraft(d, 1 / 3).ingredients[0].rawWeightG).toBe(111);
    const x = draft();
    expect(scaleDraft(x, 0)).toBe(x);
    expect(scaleDraft(x, NaN)).toBe(x);
    expect(scaleDraft(x, -2)).toBe(x);
  });
  it('keeps blank weights blank', () => {
    const d = draft(); d.cookedTotalWeightG = null; d.ingredients[0].rawWeightG = null;
    const s = scaleDraft(d, 2);
    expect(s.cookedTotalWeightG).toBeNull();
    expect(s.ingredients[0].rawWeightG).toBeNull();
  });
  it('finds the factor for a target weight', () => {
    expect(factorForTarget(draft(), 1600)).toBeCloseTo(2);
    const d = draft(); d.cookedTotalWeightG = null;
    expect(factorForTarget(d, 2100)).toBeCloseTo(2); // raw total 1050
    expect(factorForTarget(draft(), 0)).toBeNull();
  });
});

describe('ingredient drift (recipe vs. the food it was built from)', () => {
  const d = (): RecipeDraft => {
    const x = emptyDraft();
    x.ingredients = [ingredientFromFood(food(), 500), { ...ingredientFromFood(food({ id: 'gone' }), 100), id: 'g' }, { ...ingredientFromFood(food(), 10), foodId: undefined, id: 'custom' }];
    return x;
  };
  const edited = food({ proteinPer100g: 24, caloriesPer100g: 120 });
  const lookup = (id: string) => (id === 'f1' ? edited : undefined);
  it('detects changed and missing source foods, skips ingredients without a food', () => {
    const drift = findIngredientDrift(d().ingredients, lookup);
    expect(drift.map(x => x.kind).sort()).toEqual(['changed', 'missing']);
    const changed = drift.find(x => x.kind === 'changed')!;
    expect(changed.before.protein).toBe(20);
    expect(changed.after!.protein).toBe(24);
  });
  it('reports nothing when numbers match (within rounding)', () => {
    expect(findIngredientDrift(d().ingredients.slice(0, 1), id => (id === 'f1' ? food({ proteinPer100g: 20.02 }) : undefined))).toEqual([]);
  });
  it('detects a change of basis (raw → cooked)', () => {
    expect(findIngredientDrift(d().ingredients.slice(0, 1), () => food({ nutritionBasis: 'cooked' }))).toHaveLength(1);
  });
  it('applying drift updates numbers but keeps weights; recalculates the recipe', () => {
    const draft = d();
    draft.cookedTotalWeightG = 400;
    const before = calcDraft(draft);
    const updated = applyDrift(draft, findIngredientDrift(draft.ingredients, lookup));
    expect(updated.ingredients[0].rawWeightG).toBe(500);
    expect(updated.ingredients[0].per100g.protein).toBe(24);
    expect(updated.ingredients[1].per100g.protein).toBe(20); // missing source: left untouched
    expect(calcDraft(updated).totals.protein).toBeGreaterThan(before.totals.protein);
    expect(findIngredientDrift(updated.ingredients, lookup).map(x => x.kind)).toEqual(['missing']);
  });
});

describe('drift wording', () => {
  const m = (protein: number, calories: number, extra: Partial<{ carbs: number; fat: number; fiber: number }> = {}) => ({ protein, carbs: 0, fat: 2, calories, fiber: 0, ...extra });
  it('mentions only what changed', () => {
    expect(describeDrift(m(20, 110), m(24, 110))).toBe('protein 20 → 24 g');
    expect(describeDrift(m(20, 110), m(24, 120))).toBe('protein 20 → 24 g · 110 → 120 kcal');
    expect(describeDrift(m(20, 110), m(20.02, 110.01))).toBe('');
    expect(describeDrift(m(20, 110), m(20, 110), true)).toBe('raw/cooked basis changed');
  });
});
