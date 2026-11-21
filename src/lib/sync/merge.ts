/**
 * Pure merge logic for syncing between devices (no I/O).
 *
 * Rules (single user, several devices):
 *  - Every record has `updatedAt`; the newest edit wins, per record.
 *  - A delete is a record with `deletedAt` (a "tombstone"); it is just another edit, so deleting beats an older edit
 *    and a newer edit/restore beats an older delete.
 *  - Ties are broken deterministically (tombstone first, then by content) so every device picks the same winner.
 */
import type { AllData, AppSettings, DailyTargets, FoodUsage } from '../../types';

export interface Syncable { id: string; updatedAt: number; deletedAt?: number }

// ---------------------------------------------------------------- canonical JSON & hashing
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(x => stableStringify(x === undefined ? null : x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).filter(k => o[k] !== undefined).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/** Small non-cryptographic hash (cyrb53) — only used to detect "did this change". */
export function hashString(s: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
}

// ---------------------------------------------------------------- record collections
export function pickWinner<T extends Syncable>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  const da = a.deletedAt != null; const db = b.deletedAt != null;
  if (da !== db) return da ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

export interface MergeOpts {
  /** This device is the source of truth (after import / restore): remote-only records become tombstones. */
  authoritative?: boolean;
  now: number;
}

export function mergeRecords<T extends Syncable>(local: T[], remote: T[], opts: MergeOpts): T[] {
  const out = new Map<string, T>();
  if (opts.authoritative) {
    for (const r of local) out.set(r.id, { ...r, updatedAt: opts.now });
    for (const r of remote) {
      if (out.has(r.id)) continue;
      out.set(r.id, r.deletedAt != null ? r : { ...r, deletedAt: opts.now, updatedAt: opts.now });
    }
  } else {
    for (const r of local) out.set(r.id, r);
    for (const r of remote) {
      const mine = out.get(r.id);
      out.set(r.id, mine ? pickWinner(mine, r) : r);
    }
  }
  return [...out.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// ---------------------------------------------------------------- targets / favorites / usage
export interface SettingsDoc {
  targets: DailyTargets;
  favoriteFoodIds: string[];
  favoriteRecipeIds: string[];
  favoritesUpdatedAt: number;
  usage: FoodUsage[];
}

export function settingsDocFromLocal(data: Pick<AllData, 'targets' | 'settings' | 'usage'>): SettingsDoc {
  return {
    targets: data.targets,
    favoriteFoodIds: [...data.settings.favoriteFoodIds].sort(),
    favoriteRecipeIds: [...data.settings.favoriteRecipeIds].sort(),
    favoritesUpdatedAt: data.settings.favoritesUpdatedAt ?? 0,
    usage: [...data.usage].sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

export function mergeSettingsDoc(local: SettingsDoc, remote: SettingsDoc | null, opts: MergeOpts): SettingsDoc {
  if (!remote) return local;
  if (opts.authoritative) {
    return { ...local, targets: { ...local.targets, updatedAt: opts.now }, favoritesUpdatedAt: opts.now };
  }
  const lt = local.targets.updatedAt ?? 0; const rt = remote.targets.updatedAt ?? 0;
  const targets = lt !== rt ? (lt > rt ? local.targets : remote.targets) : (stableStringify(local.targets) >= stableStringify(remote.targets) ? local.targets : remote.targets);
  const lf = local.favoritesUpdatedAt; const rf = remote.favoritesUpdatedAt;
  const favSrc = lf !== rf ? (lf > rf ? local : remote) : (stableStringify([local.favoriteFoodIds, local.favoriteRecipeIds]) >= stableStringify([remote.favoriteFoodIds, remote.favoriteRecipeIds]) ? local : remote);
  const usage = new Map<string, FoodUsage>();
  for (const u of local.usage) usage.set(u.key, u);
  for (const u of remote.usage) {
    const mine = usage.get(u.key);
    if (!mine) { usage.set(u.key, u); continue; }
    const win = mine.lastUsedAt >= u.lastUsedAt ? mine : u;
    usage.set(u.key, { ...win, count: Math.max(mine.count, u.count) });
  }
  return {
    targets,
    favoriteFoodIds: favSrc.favoriteFoodIds,
    favoriteRecipeIds: favSrc.favoriteRecipeIds,
    favoritesUpdatedAt: Math.max(lf, rf),
    usage: [...usage.values()].sort((a, b) => (a.key < b.key ? -1 : 1)),
  };
}

export function applySettingsDoc(settings: AppSettings, doc: SettingsDoc): AppSettings {
  return { ...settings, favoriteFoodIds: doc.favoriteFoodIds, favoriteRecipeIds: doc.favoriteRecipeIds, favoritesUpdatedAt: doc.favoritesUpdatedAt };
}

// ---------------------------------------------------------------- remote file layout
export const FILE_FOODS = 'foods.json';
export const FILE_RECIPES = 'recipes.json';
export const FILE_SETTINGS = 'settings.json';
export const FILE_PANTRY = 'pantry.json';
export const FILE_PRICES = 'prices.json';
export const FILE_PLAN = 'plan.json';
export const logsPath = (month: string) => `logs/${month}.json`;
export const isSyncedPath = (p: string) =>
  p === FILE_FOODS || p === FILE_RECIPES || p === FILE_SETTINGS || p === FILE_PANTRY || p === FILE_PRICES || p === FILE_PLAN || /^logs\/\d{4}-\d{2}\.json$/.test(p);
export const isLogsPath = (p: string) => p.startsWith('logs/');

export interface RecordsDoc { records: Syncable[] }
export type SyncDoc = RecordsDoc | SettingsDoc;

const byId = (a: Syncable, b: Syncable) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The set of remote files that represents `data` (logs are sharded by month to keep files small). */
export function buildFiles(data: AllData): Record<string, SyncDoc> {
  const files: Record<string, SyncDoc> = {};
  if (data.foods.length) files[FILE_FOODS] = { records: [...data.foods].sort(byId) };
  if (data.recipes.length) files[FILE_RECIPES] = { records: [...data.recipes].sort(byId) };
  if (data.pantry.length) files[FILE_PANTRY] = { records: [...data.pantry].sort(byId) };
  if (data.prices.length) files[FILE_PRICES] = { records: [...data.prices].sort(byId) };
  if (data.plan.length) files[FILE_PLAN] = { records: [...data.plan].sort(byId) };
  const months = new Map<string, Syncable[]>();
  for (const l of data.logs) {
    const m = l.date.slice(0, 7);
    const arr = months.get(m); if (arr) arr.push(l); else months.set(m, [l]);
  }
  for (const [m, recs] of months) files[logsPath(m)] = { records: recs.sort(byId) };
  files[FILE_SETTINGS] = settingsDocFromLocal(data);
  return files;
}

export const emptyRecordsDoc = (): RecordsDoc => ({ records: [] });
export const isEmptyDoc = (doc: SyncDoc) => 'records' in doc && doc.records.length === 0;

export function docHash(doc: SyncDoc): string {
  return hashString(stableStringify('records' in doc ? { records: [...doc.records].sort(byId) } : doc));
}

/** One record per line keeps git diffs readable and files small. */
export function serializeDoc(doc: SyncDoc): string {
  if ('records' in doc) {
    const lines = [...doc.records].sort(byId).map(r => stableStringify(r));
    return `{"records":[\n${lines.join(',\n')}\n]}\n`;
  }
  return `${JSON.stringify(JSON.parse(stableStringify(doc)), null, 2)}\n`;
}

export class CorruptFileError extends Error {
  constructor(public path: string, detail: string) { super(`${path} on GitHub is not valid Demeter data (${detail}). Nothing was overwritten.`); }
}

export function parseDoc(path: string, text: string): SyncDoc {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new CorruptFileError(path, 'invalid JSON'); }
  if (typeof raw !== 'object' || raw === null) throw new CorruptFileError(path, 'unexpected shape');
  const o = raw as Record<string, unknown>;
  if (path === FILE_SETTINGS) {
    const t = o.targets as DailyTargets | undefined;
    if (!t || typeof t.calories !== 'number') throw new CorruptFileError(path, 'missing targets');
    return {
      targets: t,
      favoriteFoodIds: Array.isArray(o.favoriteFoodIds) ? (o.favoriteFoodIds as string[]) : [],
      favoriteRecipeIds: Array.isArray(o.favoriteRecipeIds) ? (o.favoriteRecipeIds as string[]) : [],
      favoritesUpdatedAt: typeof o.favoritesUpdatedAt === 'number' ? o.favoritesUpdatedAt : 0,
      usage: Array.isArray(o.usage) ? (o.usage as FoodUsage[]) : [],
    };
  }
  if (!Array.isArray(o.records)) throw new CorruptFileError(path, 'missing records');
  const records: Syncable[] = [];
  for (const r of o.records as Array<Record<string, unknown>>) {
    if (!r || typeof r.id !== 'string') throw new CorruptFileError(path, 'record without id');
    const updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : typeof r.createdAt === 'number' ? r.createdAt : 0;
    records.push({ ...(r as object), id: r.id, updatedAt } as Syncable);
  }
  return { records };
}

/** Fingerprint of everything that syncs (used to tell whether a merge changed this device). */
export function fingerprint(data: AllData): string {
  const sort = <T extends Syncable>(xs: T[]) => [...xs].sort(byId);
  return hashString(stableStringify({
    foods: sort(data.foods), recipes: sort(data.recipes), logs: sort(data.logs),
    pantry: sort(data.pantry), prices: sort(data.prices), plan: sort(data.plan), settings: settingsDocFromLocal(data),
  }));
}
