import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, serializeBackup, backupFileName } from './backup';
import { DEFAULT_TARGETS, defaultSettings } from './defaults';
import { DB_NAME, resetDBConnection } from './index';
import { deleteSnapshot, deleteSyncConfig, eraseEverything, getSnapshot, getSyncConfig, loadAll, putFood, putLog, putPantry, putPlanLine, putPrice, putRecipe, putSettings, putSnapshot, putSyncConfig, putTargets, putUsage, replaceAll } from './repo';
import { openDB } from 'idb';
import type { Food, MealLogEntry, Recipe } from '../types';

const now = Date.now();
const food: Food = {
  id: 'custom-1', name: 'My granola', category: 'custom', proteinPer100g: 10, carbsPer100g: 60, fatPer100g: 15,
  caloriesPer100g: 440, isLiquid: false, nutritionBasis: 'as-packaged', source: 'custom', createdAt: now, updatedAt: now,
};
const zero = { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 };
const recipe: Recipe = {
  id: 'r1', name: 'Chicken & potatoes', ingredients: [{
    id: 'i1', name: 'Chicken', per100g: { ...zero, protein: 20, calories: 110 }, nutritionBasis: 'raw', rawWeightG: 1000,
    contribution: { ...zero, protein: 200, calories: 1100 },
  }], rawTotalWeightG: 1000, cookedTotalWeightG: 800, totals: { ...zero, protein: 200, calories: 1100 },
  per100Raw: { ...zero, protein: 20, calories: 110 }, per100Cooked: { ...zero, protein: 25, calories: 137.5 },
  portionSizesG: [300], createdAt: now, updatedAt: now,
};
const log: MealLogEntry = {
  id: 'l1', date: '2026-11-20', mealType: 'dinner', recipeId: 'r1', name: 'Chicken & potatoes', consumedWeightG: 300,
  protein: 75, carbs: 0, fat: 7.5, calories: 412.5, fiber: 0, createdAt: now, updatedAt: now,
};

async function wipe() {
  await resetDBConnection();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('IndexedDB repo', () => {
  beforeEach(wipe);

  it('starts empty with default targets/settings', async () => {
    const all = await loadAll();
    expect(all.foods).toEqual([]);
    expect(all.targets).toEqual(DEFAULT_TARGETS);
    expect(all.settings.theme).toBe('dark');
  });

  it('persists foods, recipes, logs, usage, settings, targets', async () => {
    await putFood(food); await putRecipe(recipe); await putLog(log);
    await putUsage({ key: 'custom-1', count: 3, lastUsedAt: now, lastWeightG: 50 });
    await putSettings({ ...defaultSettings(), theme: 'light', favoriteFoodIds: ['custom-1'] });
    await putTargets({ ...DEFAULT_TARGETS, protein: 180 });
    await resetDBConnection(); // simulate app restart
    const all = await loadAll();
    expect(all.foods).toHaveLength(1);
    expect(all.recipes[0].per100Cooked?.protein).toBe(25);
    expect(all.logs[0].calories).toBe(412.5);
    expect(all.usage[0].count).toBe(3);
    expect(all.settings.theme).toBe('light');
    expect(all.targets.protein).toBe(180);
  });

  it('export → erase → import restores everything', async () => {
    await putFood(food); await putRecipe(recipe); await putLog(log);
    await putTargets({ ...DEFAULT_TARGETS, calories: 2500 });
    const text = serializeBackup(buildBackup(await loadAll(), new Date('2026-11-20T10:00:00Z')));
    expect(text).toContain('"schemaVersion": 3'); // human-readable & versioned
    expect(text).toContain('\n  "data"');
    await eraseEverything();
    expect((await loadAll()).logs).toHaveLength(0);
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.summary).toMatchObject({ foods: 1, recipes: 1, logs: 1 });
    await replaceAll(parsed.data);
    const restored = await loadAll();
    expect(restored.foods[0].name).toBe('My granola');
    expect(restored.recipes[0].cookedTotalWeightG).toBe(800);
    expect(restored.logs[0].protein).toBe(75);
    expect(restored.targets.calories).toBe(2500);
  });

  it('import replaces existing data rather than merging', async () => {
    await putFood(food);
    const other = { ...food, id: 'custom-2', name: 'Other' };
    await replaceAll({ foods: [other], recipes: [], logs: [], usage: [], pantry: [], prices: [], plan: [], settings: defaultSettings(), targets: DEFAULT_TARGETS });
    const all = await loadAll();
    expect(all.foods.map(f => f.id)).toEqual(['custom-2']);
  });

  it('erase everything clears data but keeps the intro flag off the screen', async () => {
    await putFood(food); await putLog(log);
    await eraseEverything();
    const all = await loadAll();
    expect(all.foods).toHaveLength(0);
    expect(all.logs).toHaveLength(0);
    expect(all.settings.introSeen).toBe(true);
  });
});

describe('backup validation', () => {
  it('rejects non-JSON, foreign files and newer schemas with a clear message', () => {
    expect(parseBackup('nope')).toMatchObject({ ok: false });
    expect(parseBackup('{"hello":1}')).toMatchObject({ ok: false });
    expect(parseBackup(JSON.stringify({ app: 'Demeter', schemaVersion: 99, data: {} }))).toMatchObject({ ok: false, error: expect.stringContaining('newer') });
    expect(parseBackup(JSON.stringify({ app: 'Demeter', schemaVersion: 1 }))).toMatchObject({ ok: false });
  });
  it('sanitises junk entries instead of crashing', () => {
    const text = JSON.stringify({
      app: 'Demeter', schemaVersion: 1, exportedAt: '2026-01-01T00:00:00Z',
      data: { foods: [{ id: 'x', name: 'Bad', proteinPer100g: 'oops' }, 5, null], recipes: [{ nope: 1 }], logs: [{ id: 'l', date: 'not-a-date' }, { ...log }], targets: { protein: 'x' } },
    });
    const r = parseBackup(text);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.foods).toHaveLength(1);
    expect(r.data.foods[0].proteinPer100g).toBe(0);
    expect(r.data.recipes).toHaveLength(0);
    expect(r.data.logs).toHaveLength(1);
    expect(r.data.targets.protein).toBe(DEFAULT_TARGETS.protein);
  });
  it('names backup files by date', () => {
    expect(backupFileName(new Date(2026, 10, 5))).toBe('demeter-backup-2026-11-05.json');
  });
});

describe('database v2', () => {
  beforeEach(wipe);

  it('upgrades an existing v1 database without losing data and adds the restore-point store', async () => {
    const v1 = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore('foods', { keyPath: 'id' });
        db.createObjectStore('recipes', { keyPath: 'id' });
        db.createObjectStore('logs', { keyPath: 'id' }).createIndex('by-date', 'date');
        db.createObjectStore('usage', { keyPath: 'key' });
        db.createObjectStore('meta');
      },
    });
    await v1.put('logs', log);
    await v1.put('foods', food);
    v1.close();
    const all = await loadAll(); // opens at v2 → runs the upgrade
    expect(all.logs[0].id).toBe('l1');
    expect(all.foods[0].id).toBe('custom-1');
    expect(all.logs[0].deletedAt).toBeUndefined(); // old records are simply "live"
    expect(await getSnapshot()).toBeUndefined();
  });

  it('keeps soft-deleted records in the DB but never exports them', async () => {
    await putLog({ ...log, id: 'gone', deletedAt: now });
    await putLog(log);
    await putFood({ ...food, id: 'gone-food', deletedAt: now });
    const all = await loadAll();
    expect(all.logs).toHaveLength(2);
    const backup = buildBackup(all);
    expect(backup.data.logs.map(l => l.id)).toEqual(['l1']);
    expect(backup.data.foods).toHaveLength(0);
    expect(backup.counts.logs).toBe(1);
  });

  it('stores one restore point and can clear it', async () => {
    const data = await loadAll();
    await putSnapshot({ id: 'restore-point', createdAt: now, reason: 'import', data });
    expect((await getSnapshot())?.reason).toBe('import');
    await deleteSnapshot();
    expect(await getSnapshot()).toBeUndefined();
  });

  it('never puts the GitHub token in a backup, and import/erase leave the sync config alone', async () => {
    await putSyncConfig({ token: 'ghp_secret', repo: 'me/demeter-data', branch: 'main', connectedAt: now, files: {} });
    await putFood(food);
    const text = serializeBackup(buildBackup(await loadAll()));
    expect(text).not.toContain('ghp_secret');
    expect(text).not.toContain('demeter-data');
    await replaceAll({ foods: [], recipes: [], logs: [], usage: [], pantry: [], prices: [], plan: [], settings: defaultSettings(), targets: DEFAULT_TARGETS });
    expect((await getSyncConfig())?.token).toBe('ghp_secret');
    await deleteSyncConfig();
    expect(await getSyncConfig()).toBeUndefined();
  });

  it('accepts v1, v2 and v3 backup files', () => {
    for (const v of [1, 2, 3]) {
      const r = parseBackup(JSON.stringify({ app: 'Demeter', schemaVersion: v, exportedAt: '2026-01-01T00:00:00Z', data: { logs: [log] } }));
      expect(r.ok, `v${v}`).toBe(true);
    }
  });
});

describe('database v3 (fridge, prices, plan)', () => {
  beforeEach(wipe);

  it('upgrades a v2 database without losing data and adds the new stores', async () => {
    const v2 = await openDB(DB_NAME, 2, {
      upgrade(db) {
        db.createObjectStore('foods', { keyPath: 'id' });
        db.createObjectStore('recipes', { keyPath: 'id' });
        db.createObjectStore('logs', { keyPath: 'id' }).createIndex('by-date', 'date');
        db.createObjectStore('usage', { keyPath: 'key' });
        db.createObjectStore('meta');
        db.createObjectStore('snapshots', { keyPath: 'id' });
      },
    });
    await v2.put('logs', log); await v2.put('foods', food);
    v2.close();
    const all = await loadAll();
    expect(all.logs).toHaveLength(1); expect(all.foods).toHaveLength(1);
    expect(all.pantry).toEqual([]); expect(all.prices).toEqual([]); expect(all.plan).toEqual([]);
  });

  it('persists fridge items, prices and plan lines, and replaceAll/erase handle them', async () => {
    await putPantry({ id: 'p1', name: 'Skyr', foodId: 'custom-1', amountG: 450, createdAt: now, updatedAt: now });
    await putPrice({ id: 'custom-1', foodId: 'custom-1', packPrice: 1.5, packG: 450, updatedAt: now });
    await putPlanLine({ id: 'pl1', week: '2026-11-16', name: 'Bowl', recipeId: 'r1', batches: 2, createdAt: now, updatedAt: now });
    await resetDBConnection();
    const all = await loadAll();
    expect(all.pantry[0]).toMatchObject({ name: 'Skyr', amountG: 450 });
    expect(all.prices[0].packPrice).toBe(1.5);
    expect(all.plan[0].batches).toBe(2);
    await eraseEverything();
    const empty = await loadAll();
    expect(empty.pantry).toEqual([]); expect(empty.prices).toEqual([]); expect(empty.plan).toEqual([]);
  });

  it('backups include the new data (live only) and old backups import with empty collections', async () => {
    await putPantry({ id: 'p1', name: 'Skyr', createdAt: now, updatedAt: now });
    await putPantry({ id: 'p2', name: 'Ran out', createdAt: now, updatedAt: now, deletedAt: now });
    await putPrice({ id: 'f', foodId: 'f', packPrice: 2, packG: 500, updatedAt: now });
    const backup = buildBackup(await loadAll());
    expect(backup.data.pantry?.map(p => p.id)).toEqual(['p1']);
    expect(backup.counts).toMatchObject({ pantry: 1, prices: 1, plan: 0 });
    const parsed = parseBackup(serializeBackup(backup));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) { expect(parsed.data.pantry).toHaveLength(1); expect(parsed.data.prices[0].packG).toBe(500); }
    const old = parseBackup(JSON.stringify({ app: 'Demeter', schemaVersion: 2, data: { logs: [log] } }));
    expect(old.ok).toBe(true);
    if (old.ok) { expect(old.data.pantry).toEqual([]); expect(old.data.plan).toEqual([]); }
  });

  it('drops junk fridge / price / plan records instead of crashing', () => {
    const r = parseBackup(JSON.stringify({
      app: 'Demeter', schemaVersion: 3,
      data: {
        pantry: [{ id: 'ok', name: 'Fine' }, { id: 1 }, null, { id: 'noname' }],
        prices: [{ id: 'f', foodId: 'f', packPrice: 2, packG: 0 }, { id: 'g', foodId: 'g', packPrice: -1, packG: 100 }, { id: 'h', foodId: 'h', packPrice: 2, packG: 100 }],
        plan: [{ id: 'p', week: 'nope', name: 'x' }, { id: 'q', week: '2026-11-16', name: 'ok', recipeId: 'r' }],
      },
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.pantry.map(p => p.id)).toEqual(['ok']);
    expect(r.data.prices.map(p => p.id)).toEqual(['h']);
    expect(r.data.plan.map(p => p.id)).toEqual(['q']);
  });
});
