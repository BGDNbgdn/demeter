import {
  BACKUP_SCHEMA_VERSION, FOOD_CATEGORIES, MEAL_TYPES,
  type AppSettings, type BackupFile, type DailyTargets, type Food, type FoodUsage, type MealLogEntry, type Recipe,
} from '../types';
import { DEFAULT_TARGETS, defaultSettings } from './defaults';
import type { AllData } from './repo';

/** Backups contain live data only (trash is not exported) and never include the GitHub token. */
export function buildBackup(allData: AllData, now = new Date()): BackupFile {
  const live = <T extends { deletedAt?: number }>(xs: T[]) => xs.filter(x => !x.deletedAt);
  const data: AllData = { ...allData, foods: live(allData.foods), recipes: live(allData.recipes), logs: live(allData.logs) };
  return {
    app: 'Demeter',
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    counts: {
      foods: data.foods.length,
      recipes: data.recipes.length,
      logs: data.logs.length,
    },
    data: {
      foods: data.foods,
      recipes: data.recipes,
      logs: data.logs,
      targets: data.targets,
      settings: data.settings,
      usage: data.usage,
    },
  };
}

/** Human-readable, versioned JSON. */
export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export function backupFileName(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `demeter-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

export type ParseResult =
  | { ok: true; data: AllData; backup: BackupFile; summary: { foods: number; recipes: number; logs: number; exportedAt: string } }
  | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanMacros(v: unknown) {
  const o = isObj(v) ? v : {};
  return { protein: num(o.protein), carbs: num(o.carbs), fat: num(o.fat), calories: num(o.calories), fiber: num(o.fiber) };
}

/** Validate and sanitise a backup file. Never throws. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (!isObj(raw) || raw.app !== 'Demeter') {
    return { ok: false, error: 'This does not look like a Demeter backup (missing "app": "Demeter").' };
  }
  const version = num(raw.schemaVersion, -1);
  if (version < 1) return { ok: false, error: 'Backup has no valid schemaVersion.' };
  if (version > BACKUP_SCHEMA_VERSION) {
    return { ok: false, error: `This backup was made by a newer version of Demeter (schema ${version}). Update the app first.` };
  }
  const d = raw.data;
  if (!isObj(d)) return { ok: false, error: 'Backup has no data section.' };
  const arr = (k: string): unknown[] => (Array.isArray(d[k]) ? (d[k] as unknown[]) : []);

  const foods: Food[] = [];
  for (const f of arr('foods')) {
    if (!isObj(f) || typeof f.id !== 'string' || typeof f.name !== 'string') continue;
    foods.push({
      ...(f as unknown as Food),
      category: FOOD_CATEGORIES.includes(f.category as never) ? (f.category as Food['category']) : 'custom',
      proteinPer100g: num(f.proteinPer100g), carbsPer100g: num(f.carbsPer100g), fatPer100g: num(f.fatPer100g),
      caloriesPer100g: num(f.caloriesPer100g), isLiquid: !!f.isLiquid,
      nutritionBasis: f.nutritionBasis === 'cooked' || f.nutritionBasis === 'as-packaged' ? f.nutritionBasis : 'raw',
      source: f.source === 'imported' ? 'imported' : 'custom',
      createdAt: num(f.createdAt, Date.now()), updatedAt: num(f.updatedAt, Date.now()),
    });
  }

  const recipes: Recipe[] = [];
  for (const r of arr('recipes')) {
    if (!isObj(r) || typeof r.id !== 'string' || typeof r.name !== 'string' || !Array.isArray(r.ingredients)) continue;
    recipes.push({
      ...(r as unknown as Recipe),
      ingredients: (r.ingredients as unknown[]).filter(isObj).map((i, idx) => ({
        ...(i as unknown as Recipe['ingredients'][number]),
        id: str(i.id, `ing-${idx}`),
        name: str(i.name, 'Ingredient'),
        per100g: cleanMacros(i.per100g),
        contribution: cleanMacros(i.contribution),
        rawWeightG: num(i.rawWeightG),
        nutritionBasis: i.nutritionBasis === 'cooked' || i.nutritionBasis === 'as-packaged' ? i.nutritionBasis : 'raw',
      })),
      rawTotalWeightG: num(r.rawTotalWeightG),
      totals: cleanMacros(r.totals),
      per100Raw: cleanMacros(r.per100Raw),
      portionSizesG: Array.isArray(r.portionSizesG) ? (r.portionSizesG as unknown[]).filter(x => typeof x === 'number' && x > 0) as number[] : [],
      createdAt: num(r.createdAt, Date.now()), updatedAt: num(r.updatedAt, Date.now()),
    });
  }

  const logs: MealLogEntry[] = [];
  for (const l of arr('logs')) {
    if (!isObj(l) || typeof l.id !== 'string' || typeof l.date !== 'string' || !DATE_RE.test(l.date)) continue;
    logs.push({
      ...(l as unknown as MealLogEntry),
      mealType: MEAL_TYPES.includes(l.mealType as never) ? (l.mealType as MealLogEntry['mealType']) : 'snack',
      name: str(l.name, 'Food'),
      consumedWeightG: num(l.consumedWeightG), protein: num(l.protein), carbs: num(l.carbs), fat: num(l.fat),
      calories: num(l.calories), fiber: num(l.fiber),
      createdAt: num(l.createdAt, Date.now()), updatedAt: num(l.updatedAt, Date.now()),
    });
  }

  const usage: FoodUsage[] = arr('usage').filter(isObj).filter(u => typeof u.key === 'string').map(u => ({
    key: u.key as string, count: num(u.count), lastUsedAt: num(u.lastUsedAt), lastWeightG: num(u.lastWeightG, 100),
    lastMealType: MEAL_TYPES.includes(u.lastMealType as never) ? (u.lastMealType as FoodUsage['lastMealType']) : undefined,
  }));

  const t = isObj(d.targets) ? d.targets : {};
  const targets: DailyTargets = {
    calories: num(t.calories, DEFAULT_TARGETS.calories), protein: num(t.protein, DEFAULT_TARGETS.protein),
    carbs: num(t.carbs, DEFAULT_TARGETS.carbs), fat: num(t.fat, DEFAULT_TARGETS.fat),
    ...(typeof t.fiber === 'number' ? { fiber: t.fiber } : { fiber: DEFAULT_TARGETS.fiber }),
  };
  const s = isObj(d.settings) ? d.settings : {};
  const settings: AppSettings = {
    ...defaultSettings(),
    ...(s as Partial<AppSettings>),
    units: 'g',
    theme: s.theme === 'light' || s.theme === 'system' ? s.theme : 'dark',
    favoriteFoodIds: Array.isArray(s.favoriteFoodIds) ? (s.favoriteFoodIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    favoriteRecipeIds: Array.isArray(s.favoriteRecipeIds) ? (s.favoriteRecipeIds as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    introSeen: true,
  };

  const data: AllData = { foods, recipes, logs, usage, settings, targets };
  const backup = buildBackup(data, new Date(str(raw.exportedAt, new Date().toISOString())));
  return {
    ok: true, data, backup,
    summary: { foods: foods.length, recipes: recipes.length, logs: logs.length, exportedAt: str(raw.exportedAt, 'unknown') },
  };
}
