import type { AppSettings, DailyTargets, Food, FoodUsage, MealLogEntry, Recipe } from '../types';
import { DEFAULT_TARGETS, defaultSettings } from './defaults';
import { getDB } from './index';

export interface AllData {
  foods: Food[];
  recipes: Recipe[];
  logs: MealLogEntry[];
  usage: FoodUsage[];
  settings: AppSettings;
  targets: DailyTargets;
}

export async function loadAll(): Promise<AllData> {
  const db = await getDB();
  const [foods, recipes, logs, usage, settings, targets] = await Promise.all([
    db.getAll('foods'),
    db.getAll('recipes'),
    db.getAll('logs'),
    db.getAll('usage'),
    db.get('meta', 'settings') as Promise<AppSettings | undefined>,
    db.get('meta', 'targets') as Promise<DailyTargets | undefined>,
  ]);
  return {
    foods, recipes, logs, usage,
    settings: { ...defaultSettings(), ...(settings ?? {}) },
    targets: { ...DEFAULT_TARGETS, ...(targets ?? {}) },
  };
}

export async function putFood(food: Food) { await (await getDB()).put('foods', food); }
export async function deleteFoodById(id: string) { await (await getDB()).delete('foods', id); }
export async function putRecipe(recipe: Recipe) { await (await getDB()).put('recipes', recipe); }
export async function deleteRecipeById(id: string) { await (await getDB()).delete('recipes', id); }
export async function putLog(entry: MealLogEntry) { await (await getDB()).put('logs', entry); }
export async function deleteLogById(id: string) { await (await getDB()).delete('logs', id); }
export async function putUsage(usage: FoodUsage) { await (await getDB()).put('usage', usage); }
export async function putSettings(settings: AppSettings) { await (await getDB()).put('meta', settings, 'settings'); }
export async function putTargets(targets: DailyTargets) { await (await getDB()).put('meta', targets, 'targets'); }

/** Replace the entire database contents in a single transaction (used by import & erase). */
export async function replaceAll(data: AllData): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(['foods', 'recipes', 'logs', 'usage', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('foods').clear(),
    tx.objectStore('recipes').clear(),
    tx.objectStore('logs').clear(),
    tx.objectStore('usage').clear(),
    tx.objectStore('meta').clear(),
  ]);
  for (const f of data.foods) tx.objectStore('foods').put(f);
  for (const r of data.recipes) tx.objectStore('recipes').put(r);
  for (const l of data.logs) tx.objectStore('logs').put(l);
  for (const u of data.usage) tx.objectStore('usage').put(u);
  tx.objectStore('meta').put(data.settings, 'settings');
  tx.objectStore('meta').put(data.targets, 'targets');
  await tx.done;
}

export async function eraseEverything(): Promise<void> {
  await replaceAll({
    foods: [], recipes: [], logs: [], usage: [],
    settings: { ...defaultSettings(), introSeen: true },
    targets: { ...DEFAULT_TARGETS },
  });
}
