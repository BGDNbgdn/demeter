/**
 * Wires the sync engine to the app: when to sync, connect/disconnect, status for the UI.
 *
 * Sync runs automatically:
 *  - when the app opens,
 *  - when it comes back to the foreground (installed iPhone apps stay alive for days),
 *  - a few seconds after you change something (so the other device sees it without waiting for you to reopen),
 *  - when the connection returns.
 * There is deliberately no "Sync now" button.
 */
import * as repo from '../../db/repo';
import { syncHooks, useAppStore } from '../../hooks/useAppStore';
import type { SyncConfig, SyncErrorKind } from '../../types';
import { LocalChangedError, runSync } from './engine';
import { GitHubClient, SyncError, parseRepoInput, type RemoteStore } from './github';
import { fingerprint } from './merge';

type Client = RemoteStore & Pick<GitHubClient, 'getRepo'>;
let clientFactory = (c: Pick<SyncConfig, 'token' | 'repo' | 'branch'>): Client => new GitHubClient(c);
/** test hook */
export function __setClientFactory(f: typeof clientFactory) { clientFactory = f; }

let config: SyncConfig | null = null;
let running = false;
let queued = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastStart = 0;
let listening = false;

let DEBOUNCE_MS = 5000;
/** test hook */
export function __setDebounce(ms: number) { DEBOUNCE_MS = ms; }
const RESUME_THROTTLE_MS = 20_000;

const setSync = (patch: Partial<ReturnType<typeof useAppStore.getState>['sync']>) =>
  useAppStore.setState(s => ({ sync: { ...s.sync, ...patch } }));

async function persist(next: SyncConfig | null) {
  config = next;
  if (next) await repo.putSyncConfig(next); else await repo.deleteSyncConfig();
}

function describe(e: unknown): { kind: SyncErrorKind; message: string } {
  if (e instanceof SyncError) return { kind: e.kind, message: e.message };
  return { kind: 'other', message: e instanceof Error ? e.message : 'Unknown sync error' };
}

export function scheduleSync(delay?: number) {
  if (!config) return;
  clearTimeout(timer);
  timer = setTimeout(() => { void syncNow('change'); }, delay ?? DEBOUNCE_MS);
}

export type SyncReason = 'open' | 'resume' | 'change' | 'connect';

export async function syncNow(reason: SyncReason): Promise<void> {
  const cfg = config;
  if (!cfg) return;
  if (running) { queued = true; return; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setSync({ status: 'offline' }); return; }
  running = true; lastStart = Date.now();
  setSync({ status: 'syncing' });
  try {
    const client = clientFactory(cfg);
    if (reason === 'open' || reason === 'connect') {
      // safety net: never sync health data to a repo that has become public
      const info = await client.getRepo();
      if (!info.isPrivate) throw new SyncError('private', 'The data repository is public. Demeter refuses to sync to a public repository — make it private again.');
      if (!info.canPush) throw new SyncError('auth', 'The token cannot write to the repository (needs Contents: Read and write).');
    }
    const out = await runSync({
      remote: client, config: cfg, now: () => Date.now(),
      loadLocal: () => repo.loadAll(),
      saveLocal: async (merged, base) => {
        // don't clobber something the user just typed
        if (fingerprint(await repo.loadAll()) !== fingerprint(base)) throw new LocalChangedError();
        await repo.replaceAll(merged);
        useAppStore.getState().applyData(merged);
      },
    });
    if (config && config.token === cfg.token) await persist(out.config);
    setSync({ status: 'idle', lastSyncAt: out.config.lastSyncAt, error: undefined });
  } catch (e) {
    if (e instanceof LocalChangedError) { queued = true; }
    else {
      const err = describe(e);
      console.warn('Sync failed:', err.message);
      if (config && config.token === cfg.token) await persist({ ...config, lastError: { ...err, at: Date.now() } }).catch(() => {});
      setSync({ status: err.kind === 'network' ? 'offline' : 'error', error: err.kind === 'network' ? undefined : err });
    }
  } finally {
    running = false;
    if (queued) { queued = false; scheduleSync(1500); }
  }
}

/** Load the saved connection (if any), start listening for triggers and sync once. Call after the store is ready. */
export async function initSync(): Promise<void> {
  syncHooks.onChange = () => scheduleSync();
  syncHooks.markAuthoritative = async () => { if (config) await persist({ ...config, authoritative: true }); };
  syncHooks.disconnect = disconnectSync;
  try {
    const saved = (await repo.getSyncConfig()) ?? null;
    config = saved;
    if (saved) {
      setSync({ configured: true, repo: saved.repo, lastSyncAt: saved.lastSyncAt, error: saved.lastError ? { kind: saved.lastError.kind, message: saved.lastError.message } : undefined, status: saved.lastError && saved.lastError.kind !== 'network' ? 'error' : 'idle' });
    }
  } catch { /* storage problems are surfaced elsewhere */ }
  if (!listening && typeof document !== 'undefined') {
    listening = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - lastStart > RESUME_THROTTLE_MS) void syncNow('resume');
    });
    window.addEventListener('online', () => { void syncNow('resume'); });
  }
  if (config) await syncNow('open');
}

export type ConnectResult = { ok: true } | { ok: false; error: string };

/** Verify the token + repository, save the connection and run the first sync. */
export async function connectSync(token: string, repoInput: string): Promise<ConnectResult> {
  const repoName = parseRepoInput(repoInput);
  const tok = token.trim();
  if (!tok) return { ok: false, error: 'Paste your GitHub token.' };
  if (!repoName) return { ok: false, error: 'Enter the repository as owner/name, e.g. yourname/demeter-data.' };
  try {
    const probe = clientFactory({ token: tok, repo: repoName, branch: 'main' });
    const info = await probe.getRepo();
    if (!info.isPrivate) return { ok: false, error: 'That repository is public. Demeter only syncs to a PRIVATE repository so nobody else can read your data.' };
    if (!info.canPush) return { ok: false, error: 'This token can read but not write. Give it Contents: Read and write on that repository.' };
    await persist({ token: tok, repo: info.fullName, branch: info.defaultBranch, connectedAt: Date.now(), files: {} });
    setSync({ configured: true, repo: info.fullName, status: 'idle', error: undefined, lastSyncAt: undefined });
  } catch (e) {
    return { ok: false, error: describe(e).message };
  }
  await syncNow('connect');
  const s = useAppStore.getState().sync;
  if (s.status === 'error' && s.error) return { ok: false, error: s.error.message };
  return { ok: true };
}

export async function disconnectSync(): Promise<void> {
  clearTimeout(timer);
  queued = false;
  await persist(null).catch(() => {});
  setSync({ configured: false, repo: undefined, status: 'idle', error: undefined, lastSyncAt: undefined });
}
