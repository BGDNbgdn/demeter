import type { AllData, Food, MealLogEntry, Recipe } from '../types';

/** How long deleted items stay recoverable (and remembered for sync) before being removed for good. */
export const TRASH_RETENTION_DAYS = 60;
const DAY = 86_400_000;

export const isDeleted = (x: { deletedAt?: number }) => typeof x.deletedAt === 'number';

export interface TrashSplit {
  foods: Food[];
  recipes: Recipe[];
  logs: MealLogEntry[];
}

export function splitLive<T extends { deletedAt?: number }>(xs: T[]): { live: T[]; trash: T[] } {
  const live: T[] = []; const trash: T[] = [];
  for (const x of xs) (isDeleted(x) ? trash : live).push(x);
  return { live, trash };
}

/** Drop soft-deleted records older than the retention window. Returns what was removed so it can be deleted from the DB. */
export function purgeExpired(data: AllData, now = Date.now(), days = TRASH_RETENTION_DAYS): { data: AllData; removed: { foods: string[]; recipes: string[]; logs: string[] } } {
  const expired = (x: { deletedAt?: number }) => isDeleted(x) && now - (x.deletedAt as number) > days * DAY;
  const removed = { foods: [] as string[], recipes: [] as string[], logs: [] as string[] };
  const keep = <T extends { id: string; deletedAt?: number }>(xs: T[], bucket: string[]) => xs.filter(x => { if (expired(x)) { bucket.push(x.id); return false; } return true; });
  return {
    data: { ...data, foods: keep(data.foods, removed.foods), recipes: keep(data.recipes, removed.recipes), logs: keep(data.logs, removed.logs) },
    removed,
  };
}

export function daysLeftInTrash(deletedAt: number, now = Date.now(), days = TRASH_RETENTION_DAYS): number {
  return Math.max(0, Math.ceil((deletedAt + days * DAY - now) / DAY));
}
