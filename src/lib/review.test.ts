import { describe, expect, it } from 'vitest';
import type { MealLogEntry, MealType } from '../types';
import { addDays } from '../utils/dates';
import { buildWeekReview, dowOf, sourceStats } from './review';

// Mon 2026-11-16 … Sun 2026-11-22; "today" is the following Wednesday so the whole week is closed
const MON = '2026-11-16';
const TODAY = '2026-11-25';
let seq = 0;
const log = (date: string, protein: number, meal: MealType = 'lunch', name = 'Food', extra: Partial<MealLogEntry> = {}): MealLogEntry => ({
  id: `l${++seq}`, date, mealType: meal, name, consumedWeightG: 200, protein, carbs: 0, fat: 0, calories: protein * 4, fiber: 0, createdAt: seq, updatedAt: seq, ...extra,
});

describe('weekday helper', () => {
  it('Monday is 0, Sunday is 6', () => {
    expect(dowOf('2026-11-16')).toBe(0);
    expect(dowOf('2026-11-22')).toBe(6);
  });
});

describe('week review basics', () => {
  it('averages only over tracked days and counts days that reach 75 % of the goal', () => {
    const logs = [log(MON, 150), log(addDays(MON, 1), 130), log(addDays(MON, 2), 60), log(addDays(MON, 3), 0, 'snack')]; // Thursday logged 0 protein
    const r = buildWeekReview(logs, 160, MON, TODAY);
    expect(r.from).toBe(MON); expect(r.to).toBe('2026-11-22');
    expect(r.trackedDays).toBe(4);
    expect(r.avgProtein).toBeCloseTo((150 + 130 + 60 + 0) / 4);
    expect(r.daysCounted).toBe(2); // 150 and 130 ≥ 120
    expect(r.best?.date).toBe(MON); expect(r.worst?.date).toBe(addDays(MON, 3));
    expect(r.days).toHaveLength(7);
  });
  it('days with nothing logged are not zeros', () => {
    const r = buildWeekReview([log(MON, 160)], 160, addDays(MON, 3), TODAY);
    expect(r.trackedDays).toBe(1);
    expect(r.avgProtein).toBe(160);
  });
  it('today is in progress: it only counts once it reaches the streak threshold', () => {
    const today = addDays(MON, 2);
    const early = buildWeekReview([log(MON, 150), log(today, 30)], 160, MON, today);
    expect(early.trackedDays).toBe(1); expect(early.todayOpen).toBe(true);
    const done = buildWeekReview([log(MON, 150), log(today, 125)], 160, MON, today);
    expect(done.trackedDays).toBe(2); expect(done.todayOpen).toBe(false);
  });
  it('ignores soft-deleted entries and compares with the previous week', () => {
    const prev = addDays(MON, -7);
    const r = buildWeekReview([log(MON, 140), log(MON, 999, 'dinner', 'x', { deletedAt: 1 }), log(prev, 100)], 160, MON, TODAY);
    expect(r.avgProtein).toBe(140);
    expect(r.prevAvgProtein).toBe(100);
    expect(buildWeekReview([log(MON, 140)], 160, MON, TODAY).prevAvgProtein).toBeNull();
  });
});

describe('sources and meals', () => {
  it('ranks protein sources with shares and typical portions', () => {
    const logs = [
      log(MON, 40, 'lunch', 'Chicken', { foodId: 'c', consumedWeightG: 180 }), log(addDays(MON, 1), 44, 'dinner', 'Chicken', { foodId: 'c', consumedWeightG: 200 }),
      log(MON, 20, 'breakfast', 'Skyr', { foodId: 's', consumedWeightG: 200 }), log(MON, 6, 'snack', 'Quick add'),
    ];
    const s = sourceStats(logs);
    expect(s.map(x => x.name)).toEqual(['Chicken', 'Skyr', 'Quick add']);
    expect(s[0]).toMatchObject({ protein: 84, times: 2, typicalG: 190, typicalProtein: 42 });
    expect(s[0].share).toBeCloseTo(84 / 110);
    expect(s.reduce((t, x) => t + x.share, 0)).toBeCloseTo(1);
  });
  it('splits protein by meal', () => {
    const r = buildWeekReview([log(MON, 10, 'breakfast'), log(MON, 60, 'lunch'), log(MON, 50, 'dinner')], 160, MON, TODAY);
    const by = Object.fromEntries(r.meals.map(m => [m.meal, m]));
    expect(by.breakfast.avg).toBe(10); expect(by.lunch.share).toBeCloseTo(0.5); expect(by.snack.protein).toBe(0);
  });
});

describe('insights', () => {
  it('asks for more data when fewer than 3 days are tracked', () => {
    expect(buildWeekReview([log(MON, 150)], 160, MON, TODAY).insight.kind).toBe('data');
  });

  it('finds a weak weekday across several weeks', () => {
    const logs: MealLogEntry[] = [];
    for (let w = 0; w < 5; w++) {
      const mon = addDays(MON, -7 * w);
      for (let d = 0; d < 7; d++) {
        // Saturdays (d = 5) are much lower
        for (const meal of ['breakfast', 'lunch', 'dinner'] as MealType[]) logs.push(log(addDays(mon, d), d === 5 ? 20 : 48, meal, 'Chicken', { foodId: 'c' }));
      }
    }
    const r = buildWeekReview(logs, 160, MON, TODAY);
    expect(r.insight.kind).toBe('weekday');
    expect(r.insight.title).toBe('Saturdays are your weak spot');
    expect(r.insight.body).toContain('60 g'); // Saturday average (3 × 20)
    expect(r.insight.body).toContain('144 g'); // other days (3 × 48)
    expect(r.insight.body).toContain('Chicken'); // uses a food you actually eat
  });

  it('flags a main meal that adds almost nothing', () => {
    const logs: MealLogEntry[] = [];
    for (let d = 0; d < 5; d++) {
      logs.push(log(addDays(MON, d), 5, 'breakfast', 'Toast'), log(addDays(MON, d), 70, 'lunch', 'Chicken bowl', { foodId: 'c' }), log(addDays(MON, d), 70, 'dinner', 'Chicken bowl', { foodId: 'c' }));
    }
    const r = buildWeekReview(logs, 160, MON, TODAY);
    expect(r.insight).toMatchObject({ kind: 'meal', title: 'Breakfast is your weakest meal' });
    expect(r.insight.body).toContain('Chicken bowl');
  });

  it('notices when one meal carries most of the protein', () => {
    const logs: MealLogEntry[] = [];
    for (let d = 0; d < 4; d++) logs.push(log(addDays(MON, d), 30, 'breakfast'), log(addDays(MON, d), 30, 'lunch'), log(addDays(MON, d), 100, 'dinner'));
    // dinner is 62 % of 160 protein per day; breakfast/lunch avg 30 g are above the 15 % floor (24 g)
    expect(buildWeekReview(logs, 160, MON, TODAY).insight.kind).toBe('spread');
  });

  it('reports being short of the goal, and a good week otherwise', () => {
    const lowLogs: MealLogEntry[] = [];
    const goodLogs: MealLogEntry[] = [];
    for (let d = 0; d < 5; d++) {
      for (const meal of ['breakfast', 'lunch', 'dinner'] as MealType[]) { lowLogs.push(log(addDays(MON, d), 25, meal)); goodLogs.push(log(addDays(MON, d), 50, meal)); }
    }
    expect(buildWeekReview(lowLogs, 160, MON, TODAY).insight.kind).toBe('short');
    const good = buildWeekReview(goodLogs, 160, MON, TODAY);
    expect(good.insight.kind).toBe('good');
    expect(good.daysCounted).toBe(5);
  });
});

describe('today in progress', () => {
  it('"today is open" only when something was logged today and it has not reached the threshold', () => {
    const today = addDays(MON, 2);
    expect(buildWeekReview([log(MON, 150)], 160, MON, today).todayOpen).toBe(false); // nothing logged today
    expect(buildWeekReview([log(MON, 150), log(today, 20)], 160, MON, today).todayOpen).toBe(true);
    expect(buildWeekReview([log(MON, 150), log(today, 150)], 160, MON, today).todayOpen).toBe(false);
  });
});
