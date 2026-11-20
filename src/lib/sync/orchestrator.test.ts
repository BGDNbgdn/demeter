import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildBackup, serializeBackup } from '../../db/backup';
import { DB_NAME, resetDBConnection } from '../../db';
import * as repo from '../../db/repo';
import { syncHooks, useAppStore } from '../../hooks/useAppStore';
import type { MealLogEntry } from '../../types';
import { SyncError } from './github';
import { __setClientFactory, __setDebounce, connectSync, disconnectSync, initSync, scheduleSync, syncNow } from './orchestrator';
import { FakeRemote } from './testing';

const remote = new FakeRemote();
let repoInfo = { isPrivate: true, canPush: true, defaultBranch: 'main', fullName: 'me/demeter-data' };
let getRepoError: Error | null = null;
__setClientFactory(() => ({
  listFiles: () => remote.listFiles(), readFile: p => remote.readFile(p), writeFile: (p, t, s, m) => remote.writeFile(p, t, s, m),
  getRepo: async () => { if (getRepoError) throw getRepoError; return repoInfo; },
}));
__setDebounce(20);

const store = () => useAppStore.getState();
const entry = (id: string, protein = 30, date = '2026-11-20'): MealLogEntry => ({
  id, date, mealType: 'lunch', name: id, consumedWeightG: 100, protein, carbs: 0, fat: 0, calories: protein * 4, fiber: 0, createdAt: Date.now(), updatedAt: Date.now(),
});
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Simulate switching to another phone: empty local database, same GitHub repo. */
async function newDevice() {
  await resetDBConnection();
  await new Promise<void>(res => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); });
  useAppStore.setState({ ready: false });
  await store().init();
  await initSync();
}

beforeEach(async () => {
  remote.files.clear(); remote.counter = 0;
  repoInfo = { isPrivate: true, canPush: true, defaultBranch: 'main', fullName: 'me/demeter-data' };
  getRepoError = null;
  await disconnectSync();
  await newDevice();
});

describe('connecting', () => {
  it('refuses a public repository and does not save the token', async () => {
    repoInfo.isPrivate = false;
    const r = await connectSync('ghp_x', 'me/demeter-data');
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('PRIVATE') });
    expect(await repo.getSyncConfig()).toBeUndefined();
    expect(store().sync.configured).toBe(false);
  });
  it('refuses a read-only token, a bad repo name, an empty token and surfaces auth errors', async () => {
    repoInfo.canPush = false;
    expect(await connectSync('t', 'me/demeter-data')).toMatchObject({ ok: false, error: expect.stringContaining('read but not write') });
    expect(await connectSync('t', 'nonsense')).toMatchObject({ ok: false, error: expect.stringContaining('owner/name') });
    expect(await connectSync('  ', 'me/x')).toMatchObject({ ok: false });
    getRepoError = new SyncError('auth', 'The GitHub token is invalid or has expired.');
    expect(await connectSync('bad', 'me/demeter-data')).toMatchObject({ ok: false, error: expect.stringContaining('invalid') });
  });
  it('connects, uploads existing local data, and keeps the token out of backups', async () => {
    await store().addLog(entry('l1', 41));
    const r = await connectSync('ghp_secret', 'https://github.com/me/demeter-data');
    expect(r).toEqual({ ok: true });
    expect(store().sync).toMatchObject({ configured: true, repo: 'me/demeter-data', status: 'idle' });
    expect(store().sync.lastSyncAt).toBeGreaterThan(0);
    expect(remote.text('logs/2026-11.json')).toContain('"id":"l1"');
    expect((await repo.getSyncConfig())?.token).toBe('ghp_secret');
    expect(serializeBackup(buildBackup(store().fullData()))).not.toContain('ghp_secret');
    expect(JSON.stringify([...remote.files.values()])).not.toContain('ghp_secret');
  });
});

describe('automatic sync', () => {
  it('changes are pushed shortly after they are made (no button)', async () => {
    await connectSync('t', 'me/demeter-data');
    await store().addLog(entry('typed', 55));
    await wait(120);
    expect(remote.text('logs/2026-11.json')).toContain('"id":"typed"');
  });

  it('opening the app on another device pulls everything (logs, custom foods, recipes, targets, favorites)', async () => {
    await store().addLog(entry('l1', 61));
    await store().saveFood({ id: 'food-1', name: 'Granola', category: 'custom', proteinPer100g: 10, carbsPer100g: 60, fatPer100g: 15, caloriesPer100g: 440, isLiquid: false, nutritionBasis: 'as-packaged', source: 'custom', createdAt: 1, updatedAt: 1 });
    await store().setTargets({ ...store().targets, protein: 175 });
    await store().toggleFavoriteFood('food-1');
    await connectSync('t', 'me/demeter-data');
    await syncNow('change');

    await newDevice();               // second phone: empty
    expect(store().logs).toHaveLength(0);
    await connectSync('t', 'me/demeter-data');
    expect(store().logs.map(l => l.id)).toEqual(['l1']);
    expect(store().customFoods.map(f => f.id)).toEqual(['food-1']);
    expect(store().targets.protein).toBe(175);
    expect(store().settings.favoriteFoodIds).toEqual(['food-1']);
    expect(store().foodMap.get('food-1')?.name).toBe('Granola');
    expect((await repo.loadAll()).logs).toHaveLength(1); // really persisted locally
  });

  it('a deletion on one device reaches the other, and undo there brings it back', async () => {
    await store().addLog(entry('l1')); await store().addLog(entry('l2'));
    await connectSync('t', 'me/demeter-data');
    const second = async () => { await newDevice(); await connectSync('t', 'me/demeter-data'); };
    await second();                                   // phone B has both
    await store().deleteLog('l1');
    await syncNow('change');
    await newDevice();                                 // back to a fresh phone A' that pulls the deletion
    await connectSync('t', 'me/demeter-data');
    expect(store().logs.map(l => l.id)).toEqual(['l2']);
    expect(store().trash.logs.map(l => l.id)).toEqual(['l1']);
    await store().restoreLog('l1');
    await syncNow('change');
    await newDevice(); await connectSync('t', 'me/demeter-data');
    expect(store().logs.map(l => l.id).sort()).toEqual(['l1', 'l2']);
  });

  it('a failing network is quiet: status offline, data untouched, recovers later', async () => {
    await connectSync('t', 'me/demeter-data');
    remote.failWith = new SyncError('network', 'offline');
    await store().addLog(entry('offline-entry'));
    await syncNow('change');
    expect(store().sync.status).toBe('offline');
    expect(store().logs.map(l => l.id)).toContain('offline-entry');
    remote.failWith = undefined;
    await syncNow('change');
    expect(store().sync.status).toBe('idle');
    expect(remote.text('logs/2026-11.json')).toContain('offline-entry');
  });

  it('an expired token shows an auth error until you reconnect', async () => {
    await connectSync('t', 'me/demeter-data');
    remote.failWith = new SyncError('auth', 'The GitHub token is invalid or has expired.');
    await syncNow('change');
    expect(store().sync.status).toBe('error');
    expect(store().sync.error?.kind).toBe('auth');
    remote.failWith = undefined;
    await initSync(); // reopening the app retries
    expect(store().sync.status).toBe('idle');
  });

  it('on app open it refuses to keep syncing if the repo was made public', async () => {
    await connectSync('t', 'me/demeter-data');
    repoInfo.isPrivate = false;
    await initSync();
    expect(store().sync.status).toBe('error');
    expect(store().sync.error?.kind).toBe('private');
  });

  it('debounces bursts of edits into one sync', async () => {
    await connectSync('t', 'me/demeter-data');
    const before = remote.writes;
    for (let i = 0; i < 5; i++) await store().addLog(entry(`burst-${i}`));
    scheduleSync(20);
    await wait(150);
    expect(remote.writes - before).toBe(1); // one month file, written once
    expect(remote.text('logs/2026-11.json')?.match(/"id":"burst-/g)?.length).toBe(5);
  });
});

describe('safety nets', () => {
  it('delete → trash → restore for logs, recipes and custom foods; nothing is hard-deleted', async () => {
    await store().addLog(entry('l1'));
    await store().saveFood({ id: 'f1', name: 'Mine', category: 'custom', proteinPer100g: 1, carbsPer100g: 1, fatPer100g: 1, caloriesPer100g: 17, isLiquid: false, nutritionBasis: 'raw', source: 'custom', createdAt: 1, updatedAt: 1 });
    await store().saveRecipe({ id: 'r1', name: 'Bake', ingredients: [], rawTotalWeightG: 0, totals: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 }, per100Raw: { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 }, portionSizesG: [], createdAt: 1, updatedAt: 1 });
    await store().deleteLog('l1'); await store().deleteFood('f1'); await store().deleteRecipe('r1');
    expect(store().logs).toHaveLength(0);
    expect(store().foodMap.has('f1')).toBe(false); // gone from search
    expect(store().recipes).toHaveLength(0);
    expect(store().trash.logs).toHaveLength(1); expect(store().trash.foods).toHaveLength(1); expect(store().trash.recipes).toHaveLength(1);
    const onDisk = await repo.loadAll();
    expect(onDisk.logs[0].deletedAt).toBeDefined();
    expect(onDisk.foods[0].deletedAt).toBeDefined();
    expect(JSON.parse(store().exportJSON().text).data.logs).toHaveLength(0); // trash is not exported
    await store().restoreLog('l1'); await store().restoreFood('f1'); await store().restoreRecipe('r1');
    expect(store().logs).toHaveLength(1); expect(store().foodMap.has('f1')).toBe(true); expect(store().recipes).toHaveLength(1);
    expect(store().trash.logs).toHaveLength(0);
    expect((await repo.loadAll()).logs[0].deletedAt).toBeUndefined();
  });

  it('forgets items deleted more than 60 days ago when the app starts', async () => {
    const old = { ...entry('ancient'), deletedAt: Date.now() - 61 * 86_400_000 };
    await repo.putLog(old); await repo.putLog(entry('fresh'));
    useAppStore.setState({ ready: false });
    await store().init();
    expect((await repo.loadAll()).logs.map(l => l.id)).toEqual(['fresh']);
    expect(store().trash.logs).toHaveLength(0);
  });

  it('import takes a restore point first; "restore previous data" swaps it back', async () => {
    await store().addLog(entry('mine', 77));
    const imported = { ...store().fullData(), logs: [entry('from-file', 10)] };
    await store().importAll(imported);
    expect(store().logs.map(l => l.id)).toEqual(['from-file']);
    expect(store().restorePoint?.reason).toBe('import');
    await store().restoreFromRestorePoint();
    expect(store().logs.map(l => l.id)).toEqual(['mine']);
    expect(store().restorePoint?.reason).toBe('restore'); // the replaced data is now the restore point, so this is undoable too
    await store().restoreFromRestorePoint();
    expect(store().logs.map(l => l.id)).toEqual(['from-file']);
  });

  it('erase all takes a restore point, disconnects sync, but leaves the cloud copy alone', async () => {
    await store().addLog(entry('l1'));
    await connectSync('t', 'me/demeter-data');
    await store().eraseAll();
    expect(store().logs).toHaveLength(0);
    expect(store().sync.configured).toBe(false);
    expect(await repo.getSyncConfig()).toBeUndefined();
    expect(remote.text('logs/2026-11.json')).toContain('"id":"l1"');
    await store().restoreFromRestorePoint();
    expect(store().logs.map(l => l.id)).toEqual(['l1']);
  });

  it('importing while connected makes the cloud match the file (leftovers become recoverable tombstones)', async () => {
    await store().addLog(entry('keep')); await store().addLog(entry('extra'));
    await connectSync('t', 'me/demeter-data');
    await store().importAll({ ...store().fullData(), logs: store().logs.filter(l => l.id === 'keep') });
    await syncNow('change');
    expect(remote.text('logs/2026-11.json')).toMatch(/"deletedAt":\d+[^\n]*"id":"extra"|"id":"extra"[^\n]*"deletedAt":\d+/);
    await newDevice(); await connectSync('t', 'me/demeter-data');
    expect(store().logs.map(l => l.id)).toEqual(['keep']);
  });

  it('hooks are wired only once sync is initialised', () => {
    expect(typeof syncHooks.onChange).toBe('function');
  });
});

describe('regressions', () => {
  it('saving identical targets is a no-op (a save can never trigger itself or reset the sync timer)', async () => {
    await connectSync('t', 'me/demeter-data');
    await store().setTargets({ ...store().targets, protein: 171 });
    const stamp = store().targets.updatedAt;
    const writes = remote.writes;
    await wait(40);
    for (let i = 0; i < 5; i++) await store().setTargets({ ...store().targets }); // what the Settings screen used to do in a loop
    await wait(60);
    expect(store().targets.updatedAt).toBe(stamp);
    expect(remote.writes - writes).toBeLessThanOrEqual(1);
  });
});
