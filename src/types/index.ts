// Core data model for Demeter. Everything here is persisted locally in IndexedDB.

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export type FoodCategory =
  | 'protein' | 'carb' | 'fat' | 'vegetable' | 'fruit' | 'dairy'
  | 'sauce' | 'beverage' | 'supplement' | 'snack' | 'other' | 'custom';
export const FOOD_CATEGORIES: FoodCategory[] = [
  'protein', 'carb', 'fat', 'vegetable', 'fruit', 'dairy', 'sauce', 'beverage', 'supplement', 'snack', 'other', 'custom',
];

/** What the per-100 g numbers describe. */
export type NutritionBasis = 'raw' | 'cooked' | 'as-packaged';
export type FoodSource = 'builtin' | 'custom' | 'imported';

/** Nutrition amounts (grams, kcal). Used both per-100 g and as absolute totals. */
export interface Macros {
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  fiber: number;
}

export interface Serving {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  category: FoodCategory;
  servingDescription?: string;
  servings?: Serving[];
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  caloriesPer100g: number;
  fiberPer100g?: number;
  isLiquid: boolean;
  /** Typical cooked weight as a % of raw weight (e.g. chicken ≈ 75, white rice ≈ 280). */
  defaultCookedWeightRetentionPercent?: number;
  nutritionBasis: NutritionBasis;
  source: FoodSource;
  aliases?: string[];
  note?: string;
  usdaId?: number;
  barcode?: string;
  createdAt: number;
  updatedAt: number;
  /** Soft delete: set when the food is moved to "Recently deleted". */
  deletedAt?: number;
}

export interface RecipeIngredient {
  id: string;
  /** Present when picked from the food database; may refer to a builtin or custom food. */
  foodId?: string;
  name: string;
  /** Snapshot of the nutrition per 100 g (raw / as-packaged) at the time it was added. */
  per100g: Macros;
  nutritionBasis: NutritionBasis;
  rawWeightG: number;
  /** Optional: weight of just this ingredient after cooking. */
  cookedWeightG?: number;
  /** Calculated: rawWeightG × per100g / 100 */
  contribution: Macros;
  defaultRetentionPercent?: number;
}

export interface Recipe {
  id: string;
  name: string;
  notes?: string;
  ingredients: RecipeIngredient[];
  rawTotalWeightG: number;
  /** Entered after cooking (weight of the whole finished dish). */
  cookedTotalWeightG?: number;
  /** Calculated nutrition for the entire recipe (identical before & after cooking). */
  totals: Macros;
  per100Raw: Macros;
  per100Cooked?: Macros;
  /** Saved portion sizes in grams of cooked dish. */
  portionSizesG: number[];
  /** Portions logged on/after this date count as eaten from the current batch (YYYY-MM-DD). */
  batchStartedAt?: string;
  isFavorite?: boolean;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface MealLogEntry {
  id: string;
  /** Local date, YYYY-MM-DD. */
  date: string;
  mealType: MealType;
  foodId?: string;
  recipeId?: string;
  /** Snapshot so history survives later edits / deletions. */
  name: string;
  consumedWeightG: number;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  fiber: number;
  notes?: string;
  /** Present when the entry came from the raw→cooked converter. */
  cooking?: { rawWeightG: number; cookedWeightG: number; estimated?: boolean };
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

export interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  /** Last edit time — used to merge targets between devices. */
  updatedAt?: number;
}

export type ThemePref = 'dark' | 'light' | 'system';

export interface AppSettings {
  units: 'g';
  theme: ThemePref;
  favoriteFoodIds: string[];
  favoriteRecipeIds: string[];
  introSeen: boolean;
  onlineLookupEnabled: boolean;
  backupReminderDays: number; // 0 = off
  lastExportAt?: number;
  /** Last time favorites changed — used to merge favorites between devices. */
  favoritesUpdatedAt?: number;
  createdAt: number;
}

/** How often each food was logged — powers "recent" and "frequent" lists. */
export interface FoodUsage {
  /** food id or `recipe:<id>` */
  key: string;
  count: number;
  lastUsedAt: number;
  lastWeightG: number;
  lastMealType?: MealType;
}

export const BACKUP_SCHEMA_VERSION = 2;

export interface BackupFile {
  app: 'Demeter';
  schemaVersion: number;
  exportedAt: string;
  counts: Record<string, number>;
  data: {
    foods: Food[];
    recipes: Recipe[];
    logs: MealLogEntry[];
    targets: DailyTargets;
    settings: AppSettings;
    usage: FoodUsage[];
  };
}

/** Everything stored locally (including soft-deleted records). */
export interface AllData {
  foods: Food[];
  recipes: Recipe[];
  logs: MealLogEntry[];
  usage: FoodUsage[];
  settings: AppSettings;
  targets: DailyTargets;
}

/** One-slot "restore point" taken automatically before import / erase / restore. */
export interface Snapshot {
  id: 'restore-point';
  createdAt: number;
  reason: 'import' | 'erase' | 'restore';
  data: AllData;
}

export type SyncErrorKind = 'auth' | 'network' | 'private' | 'other';

/** GitHub sync configuration + bookkeeping. Stored in IndexedDB only — never exported in backups. */
export interface SyncConfig {
  token: string;
  /** "owner/name" of the PRIVATE data repository. */
  repo: string;
  branch: string;
  connectedAt: number;
  lastSyncAt?: number;
  lastError?: { kind: SyncErrorKind; message: string; at: number };
  /** Per remote file: blob sha and hash of the local content at the last successful sync. */
  files: Record<string, { sha: string; hash: string }>;
  /** After import / restore: make the cloud copy match this device instead of merging. */
  authoritative?: boolean;
}
