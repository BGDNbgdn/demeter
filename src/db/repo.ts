import type { AllData, AppSettings, DailyTargets, Food, FoodPrice, FoodUsage, MealLogEntry, PantryItem, PlanLine, Recipe, Snapshot, SyncConfig } from '../types';
import { DEFAULT_TARGETS, defaultSettings } from './defaults';
import { getDB } from './index';

export type { AllData };

/** Loads everything, INCLUDING soft-deleted records (the store splits live vs. trash). */
export async function loadAll(): Promise<AllData> {
  const db = await getDB();
  const [foods, recipes, logs, usage, pantry, prices, plan, settings, targets] = await Promise.all([
    db.getAll('foods'),
    db.getAll('recipes'),
    db.getAll('logs'),
    db.getAll('usage'),
    db.getAll('pantry'),
    db.getAll('prices'),
    db.getAll('plan'),
    db.get('meta', 'settings') as Promise<AppSettings | undefined>,
    db.get('meta', 'targets') as Promise<DailyTargets | undefined>,
  ]);
  return {
    foods, recipes, logs, usage, pantry, prices, plan,
    settings: { ...defaultSettings(), ...(settings ?? {}) },
    targets: { ...DEFAULT_TARGETS, ...(targets ?? {}) },
  };
}

export async function putFood(food: Food) { await (await getDB()).put('foods', food); }
export async function putFoods(foods: Food[]) { const tx = (await getDB()).transaction('foods', 'readwrite'); foods.forEach(f => tx.store.put(f)); await tx.done; }
export async function deleteFoodById(id: string) { await (await getDB()).delete('foods', id); }
export async function putRecipe(recipe: Recipe) { await (await getDB()).put('recipes', recipe); }
export async function deleteRecipeById(id: string) { await (await getDB()).delete('recipes', id); }
export async function putLog(entry: MealLogEntry) { await (await getDB()).put('logs', entry); }
export async function deleteLogById(id: string) { await (await getDB()).delete('logs', id); }
export async function putPantry(item: PantryItem) { await (await getDB()).put('pantry', item); }
export async function deletePantryById(id: string) { await (await getDB()).delete('pantry', id); }
export async function putPrice(price: FoodPrice) { await (await getDB()).put('prices', price); }
export async function deletePriceById(id: string) { await (await getDB()).delete('prices', id); }
export async function putPlanLine(line: PlanLine) { await (await getDB()).put('plan', line); }
export async function deletePlanLineById(id: string) { await (await getDB()).delete('plan', id); }
export async function putUsage(usage: FoodUsage) { await (await getDB()).put('usage', usage); }
export async function putSettings(settings: AppSettings) { await (await getDB()).put('meta', settings, 'settings'); }
export async function putTargets(targets: DailyTargets) { await (await getDB()).put('meta', targets, 'targets'); }

/** Replace the entire database contents in a single transaction (used by import, restore & sync). */
export async function replaceAll(data: AllData): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['foods', 'recipes', 'logs', 'usage', 'pantry', 'prices', 'plan', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('foods').clear(),
    tx.objectStore('recipes').clear(),
    tx.objectStore('logs').clear(),
    tx.objectStore('usage').clear(),
    tx.objectStore('pantry').clear(),
    tx.objectStore('prices').clear(),
    tx.objectStore('plan').clear(),
    // keep the sync configuration: it is not part of the data set
    (async () => {
      const meta = tx.objectStore('meta');
      await meta.delete('settings');
      await meta.delete('targets');
    })(),
  ]);
  for (const f of data.foods) tx.objectStore('foods').put(f);
  for (const r of data.recipes) tx.objectStore('recipes').put(r);
  for (const l of data.logs) tx.objectStore('logs').put(l);
  for (const u of data.usage) tx.objectStore('usage').put(u);
  for (const x of data.pantry) tx.objectStore('pantry').put(x);
  for (const x of data.prices) tx.objectStore('prices').put(x);
  for (const x of data.plan) tx.objectStore('plan').put(x);
  tx.objectStore('meta').put(data.settings, 'settings');
  tx.objectStore('meta').put(data.targets, 'targets');
  await tx.done;
}

export async function eraseEverything(): Promise<void> {
  await replaceAll({
    foods: [], recipes: [], logs: [], usage: [], pantry: [], prices: [], plan: [],
    settings: { ...defaultSettings(), introSeen: true },
    targets: { ...DEFAULT_TARGETS },
  });
}

// ---------------------------------------------------------------- restore point
export async function getSnapshot(): Promise<Snapshot | undefined> { return (await getDB()).get('snapshots', 'restore-point'); }
export async function putSnapshot(s: Snapshot) { await (await getDB()).put('snapshots', s); }
export async function deleteSnapshot() { await (await getDB()).delete('snapshots', 'restore-point'); }

// ---------------------------------------------------------------- sync config
export async function getSyncConfig(): Promise<SyncConfig | undefined> { return (await (await getDB()).get('meta', 'sync')) as SyncConfig | undefined; }
export async function putSyncConfig(c: SyncConfig) { await (await getDB()).put('meta', c, 'sync'); }
export async function deleteSyncConfig() { await (await getDB()).delete('meta', 'sync'); }
