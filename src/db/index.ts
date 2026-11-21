import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, DailyTargets, Food, FoodPrice, FoodUsage, MealLogEntry, PantryItem, PlanLine, Recipe, Snapshot, SyncConfig } from '../types';

export const DB_NAME = 'demeter';
export const DB_VERSION = 3;

export interface DemeterDB extends DBSchema {
  foods: { key: string; value: Food };
  recipes: { key: string; value: Recipe };
  logs: { key: string; value: MealLogEntry; indexes: { 'by-date': string } };
  usage: { key: string; value: FoodUsage };
  meta: { key: 'settings' | 'targets' | 'sync'; value: AppSettings | DailyTargets | SyncConfig };
  snapshots: { key: string; value: Snapshot };
  pantry: { key: string; value: PantryItem };
  prices: { key: string; value: FoodPrice };
  plan: { key: string; value: PlanLine };
}

let dbPromise: Promise<IDBPDatabase<DemeterDB>> | null = null;

/** Open (and create on first run) the local database. All user data lives here, on this device. */
export function getDB(): Promise<IDBPDatabase<DemeterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DemeterDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('foods', { keyPath: 'id' });
          db.createObjectStore('recipes', { keyPath: 'id' });
          const logs = db.createObjectStore('logs', { keyPath: 'id' });
          logs.createIndex('by-date', 'date');
          db.createObjectStore('usage', { keyPath: 'key' });
          db.createObjectStore('meta');
        }
        if (oldVersion < 2) {
          // v2: restore points (soft delete needs no schema change — it is just a field on records)
          db.createObjectStore('snapshots', { keyPath: 'id' });
        }
        if (oldVersion < 3) {
          // v3: my fridge, prices, weekly plan
          db.createObjectStore('pantry', { keyPath: 'id' });
          db.createObjectStore('prices', { keyPath: 'id' });
          db.createObjectStore('plan', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

/** Test helper: forget the cached connection (after deleting the database). */
export async function resetDBConnection() {
  if (dbPromise) {
    try { (await dbPromise).close(); } catch { /* ignore */ }
  }
  dbPromise = null;
}
