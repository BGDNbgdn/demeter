import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AppSettings, DailyTargets, Food, FoodUsage, MealLogEntry, Recipe } from '../types';

export const DB_NAME = 'demeter';
export const DB_VERSION = 1;

export interface DemeterDB extends DBSchema {
  foods: { key: string; value: Food };
  recipes: { key: string; value: Recipe };
  logs: { key: string; value: MealLogEntry; indexes: { 'by-date': string } };
  usage: { key: string; value: FoodUsage };
  meta: { key: 'settings' | 'targets'; value: AppSettings | DailyTargets };
}

let dbPromise: Promise<IDBPDatabase<DemeterDB>> | null = null;

/** Open (and create on first run) the local database. All user data lives here, on this device. */
export function getDB(): Promise<IDBPDatabase<DemeterDB>> {
  if (!dbPromise) {
    dbPromise = openDB<DemeterDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('foods', { keyPath: 'id' });
        db.createObjectStore('recipes', { keyPath: 'id' });
        const logs = db.createObjectStore('logs', { keyPath: 'id' });
        logs.createIndex('by-date', 'date');
        db.createObjectStore('usage', { keyPath: 'key' });
        db.createObjectStore('meta');
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
