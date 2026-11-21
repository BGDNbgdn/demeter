/**
 * One sync pass between this device and the private GitHub repository.
 *
 *   list remote files → fetch only the ones that changed → merge (newest edit wins) → save locally if changed
 *   → write only the files whose content differs from what is on GitHub.
 *
 * It is safe to run repeatedly (idempotent) and to retry after a failure at any point.
 */
import type { AllData, SyncConfig } from '../../types';
import { purgeExpired } from '../trash';
import { SyncConflict, SyncError, type RemoteStore } from './github';
import {
  CorruptFileError, buildFiles, docHash, emptyRecordsDoc, fingerprint, isEmptyDoc, isLogsPath, isSyncedPath, mergeRecords,
  mergeSettingsDoc, parseDoc, serializeDoc, settingsDocFromLocal, applySettingsDoc,
  FILE_FOODS, FILE_PANTRY, FILE_PLAN, FILE_PRICES, FILE_RECIPES, FILE_SETTINGS, type RecordsDoc, type SettingsDoc, type SyncDoc, type Syncable,
} from './merge';

/** Thrown by saveLocal when the user edited something while the sync was running — just run again. */
export class LocalChangedError extends Error { constructor() { super('Local data changed during sync'); } }

export interface SyncDeps {
  remote: RemoteStore;
  config: SyncConfig;
  loadLocal(): Promise<AllData>;
  /** Persist merged data. `base` is what was loaded at the start (to detect concurrent edits). */
  saveLocal(merged: AllData, base: AllData): Promise<void>;
  now(): number;
}

export interface SyncOutcome {
  config: SyncConfig;
  changedLocal: boolean;
  filesRead: number;
  filesWritten: number;
}

const MAX_ATTEMPTS = 4;

export async function runSync(deps: SyncDeps): Promise<SyncOutcome> {
  let last: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await attemptSync(deps);
    } catch (e) {
      last = e;
      if (e instanceof SyncConflict) continue; // someone else wrote in between — read again and re-merge
      if (e instanceof CorruptFileError) throw new SyncError('other', e.message);
      throw e;
    }
  }
  throw last instanceof Error ? last : new SyncError('other', 'Sync kept conflicting; will retry later.');
}

async function attemptSync(deps: SyncDeps): Promise<SyncOutcome> {
  const { remote, config } = deps;
  const now = deps.now();
  const authoritative = !!config.authoritative;

  const tree = await remote.listFiles();
  const baseLocal = await deps.loadLocal();
  const local = purgeExpired(baseLocal, now).data;

  // which remote files do we need to read? (authoritative mode needs the full remote to tombstone leftovers)
  const remotePaths = Object.keys(tree).filter(isSyncedPath);
  const changed = remotePaths.filter(p => authoritative || tree[p] !== config.files[p]?.sha);
  const fetched: Record<string, SyncDoc> = {};
  for (const p of changed) fetched[p] = parseDoc(p, await remote.readFile(p));

  const recordsOf = (p: string): Syncable[] => ((fetched[p] as RecordsDoc | undefined)?.records ?? []);
  const remoteLogs = changed.filter(isLogsPath).flatMap(recordsOf);
  const opts = { authoritative, now };

  const mergedSettings = mergeSettingsDoc(settingsDocFromLocal(local), (fetched[FILE_SETTINGS] as SettingsDoc | undefined) ?? null, opts);
  const mergedRaw: AllData = {
    foods: mergeRecords(local.foods, recordsOf(FILE_FOODS) as typeof local.foods, opts),
    recipes: mergeRecords(local.recipes, recordsOf(FILE_RECIPES) as typeof local.recipes, opts),
    logs: mergeRecords(local.logs, remoteLogs as typeof local.logs, opts),
    pantry: mergeRecords(local.pantry, recordsOf(FILE_PANTRY) as typeof local.pantry, opts),
    prices: mergeRecords(local.prices, recordsOf(FILE_PRICES) as typeof local.prices, opts),
    plan: mergeRecords(local.plan, recordsOf(FILE_PLAN) as typeof local.plan, opts),
    usage: mergedSettings.usage,
    targets: mergedSettings.targets,
    settings: applySettingsDoc(local.settings, mergedSettings),
  };
  const merged = purgeExpired(mergedRaw, now).data;

  const changedLocal = fingerprint(merged) !== fingerprint(baseLocal);
  if (changedLocal) await deps.saveLocal(merged, baseLocal);

  // ---- write what differs from GitHub
  const desired = buildFiles(merged);
  const paths = new Set<string>([...Object.keys(desired), ...remotePaths]);
  const files: SyncConfig['files'] = {};
  let filesWritten = 0;
  for (const p of paths) {
    const doc: SyncDoc = desired[p] ?? emptyRecordsDoc();
    const h = docHash(doc);
    const existsRemote = p in tree;
    const knownHash = existsRemote ? (fetched[p] ? docHash(fetched[p]) : config.files[p]?.hash) : undefined;
    if (existsRemote && knownHash === h) { files[p] = { sha: tree[p], hash: h }; continue; }
    if (!existsRemote && isEmptyDoc(doc)) continue; // never create empty files
    const sha = await remote.writeFile(p, serializeDoc(doc), existsRemote ? tree[p] : undefined, `Demeter sync ${new Date(now).toISOString()}`);
    files[p] = { sha, hash: h };
    filesWritten++;
  }

  const { lastError: _dropped, ...rest } = config;
  void _dropped;
  return {
    config: { ...rest, files, lastSyncAt: now, authoritative: false },
    changedLocal,
    filesRead: changed.length,
    filesWritten,
  };
}
