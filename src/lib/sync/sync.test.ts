import { describe, expect, it } from 'vitest';
import { LocalChangedError, runSync } from './engine';
import { GitHubClient, SyncConflict, SyncError, parseRepoInput, toBase64Utf8 } from './github';
import { Device, FakeRemote, tick } from './testing';
import { fingerprint, hashString, mergeRecords, parseDoc, pickWinner, stableStringify } from './merge';

const setup = () => { const remote = new FakeRemote(); return { remote, a: new Device(remote, 'A'), b: new Device(remote, 'B') }; };

// ------------------------------------------------------------------ tests
describe('merge primitives', () => {
  it('newest edit wins; delete is just another edit', () => {
    type R = { id: string; updatedAt: number; deletedAt?: number; v?: string };
    const base: R = { id: 'x', updatedAt: 5 };
    expect(pickWinner<R>({ ...base, v: 'old' }, { ...base, updatedAt: 9, v: 'new' }).v).toBe('new');
    const del: R = { id: 'x', updatedAt: 10, deletedAt: 10 };
    expect(pickWinner<R>({ id: 'x', updatedAt: 7 }, del)).toBe(del); // delete newer than edit
    expect(pickWinner<R>({ id: 'x', updatedAt: 12 }, del).deletedAt).toBeUndefined(); // restore/edit newer than delete
  });
  it('ties resolve identically regardless of argument order (so devices converge)', () => {
    type R = { id: string; updatedAt: number; deletedAt?: number; v?: string };
    const a: R = { id: 'x', updatedAt: 5, v: 'a' }; const b: R = { id: 'x', updatedAt: 5, v: 'b' };
    expect(pickWinner(a, b)).toEqual(pickWinner(b, a));
    const del: R = { id: 'x', updatedAt: 5, deletedAt: 5 };
    expect(pickWinner(a, del)).toBe(del);
    expect(pickWinner(del, a)).toBe(del);
  });
  it('mergeRecords is a deterministic union', () => {
    const out = mergeRecords([{ id: 'b', updatedAt: 1 }, { id: 'a', updatedAt: 1 }], [{ id: 'c', updatedAt: 1 }, { id: 'a', updatedAt: 3 }], { now: 9 });
    expect(out.map(r => `${r.id}:${r.updatedAt}`)).toEqual(['a:3', 'b:1', 'c:1']);
  });
  it('authoritative merge makes local win and tombstones remote-only records', () => {
    const out = mergeRecords([{ id: 'keep', updatedAt: 1 }], [{ id: 'keep', updatedAt: 99 }, { id: 'ghost', updatedAt: 5 }, { id: 'old-del', updatedAt: 2, deletedAt: 2 }], { authoritative: true, now: 50 });
    const m = Object.fromEntries(out.map(r => [r.id, r]));
    expect(m.keep).toMatchObject({ updatedAt: 50 }); // beats remote's 99
    expect(m.keep.deletedAt).toBeUndefined();
    expect(m.ghost).toMatchObject({ deletedAt: 50, updatedAt: 50 });
    expect(m['old-del'].deletedAt).toBe(2);
  });
  it('stableStringify ignores key order and undefined; hashString is stable', () => {
    expect(stableStringify({ b: 1, a: [1, { d: 2, c: undefined }] })).toBe('{"a":[1,{"d":2}],"b":1}');
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
  it('parseDoc rejects garbage with a clear error', () => {
    expect(() => parseDoc('foods.json', 'nope')).toThrow(/not valid Demeter data/);
    expect(() => parseDoc('foods.json', '{"records":[{"name":"no id"}]}')).toThrow(/record without id/);
    expect(() => parseDoc('settings.json', '{}')).toThrow(/missing targets/);
    expect(parseDoc('foods.json', '{"records":[{"id":"a","createdAt":7}]}')).toEqual({ records: [{ id: 'a', createdAt: 7, updatedAt: 7 }] });
  });
});

describe('two-device sync', () => {
  it('first sync uploads, shards logs by month, and never creates empty files', async () => {
    const { remote, a } = setup();
    a.log('l1', '2026-11-20'); a.log('l2', '2026-11-21'); a.log('l3', '2026-12-01');
    a.food('f1');
    const out = await a.sync();
    expect([...remote.files.keys()].sort()).toEqual(['foods.json', 'logs/2026-11.json', 'logs/2026-12.json', 'settings.json']); // no recipes.json (none exist)
    expect(out.filesWritten).toBe(4);
    expect(remote.text('logs/2026-11.json')).toContain('"id":"l1"');
    expect(remote.text('logs/2026-12.json')).not.toContain('"id":"l1"');
  });

  it('a fresh second device pulls everything, including targets and favorites', async () => {
    const { a, b } = setup();
    a.log('l1', '2026-11-20', 42); a.food('f1'); a.recipe('r1');
    a.data.targets = { ...a.data.targets, protein: 190, updatedAt: tick() };
    a.data.settings = { ...a.data.settings, favoriteFoodIds: ['f1'], favoritesUpdatedAt: tick() };
    await a.sync();
    const out = await b.sync();
    expect(out.changedLocal).toBe(true);
    expect(b.data.logs.map(l => l.id)).toEqual(['l1']);
    expect(b.data.foods.map(f => f.id)).toEqual(['f1']);
    expect(b.data.recipes.map(r => r.id)).toEqual(['r1']);
    expect(b.data.targets.protein).toBe(190);
    expect(b.data.settings.favoriteFoodIds).toEqual(['f1']);
    expect(b.data.settings.theme).toBe('dark'); // device-specific settings are untouched
  });

  it('edits propagate (newest wins) in both directions', async () => {
    const { a, b } = setup();
    a.log('l1', '2026-11-20', 10);
    await a.sync(); await b.sync();
    b.edit('l1', { protein: 55 });
    await b.sync(); await a.sync();
    expect(a.data.logs[0].protein).toBe(55);
    a.edit('l1', { protein: 66 });
    await a.sync(); await b.sync();
    expect(b.data.logs[0].protein).toBe(66);
  });

  it('a delete on one device removes it on the other; a restore brings it back', async () => {
    const { a, b } = setup();
    a.log('l1', '2026-11-20'); a.log('l2', '2026-11-20');
    await a.sync(); await b.sync();
    a.remove('l1');
    await a.sync(); await b.sync();
    expect(b.live()).toEqual(['l2']);
    expect(b.data.logs.find(l => l.id === 'l1')?.deletedAt).toBeDefined(); // tombstone kept for trash / further sync
    b.restore('l1');
    await b.sync(); await a.sync();
    expect(a.live()).toEqual(['l1', 'l2']);
  });

  it('simultaneous changes to different records both survive', async () => {
    const { a, b } = setup();
    a.log('base', '2026-11-20');
    await a.sync(); await b.sync();
    a.log('from-a', '2026-11-20'); b.log('from-b', '2026-11-20');
    await a.sync(); await b.sync(); await a.sync();
    expect(a.live()).toEqual(['base', 'from-a', 'from-b']);
    expect(b.live()).toEqual(['base', 'from-a', 'from-b']);
  });

  it('simultaneous edits to the same record converge on the newer one', async () => {
    const { a, b } = setup();
    a.log('l1', '2026-11-20', 10);
    await a.sync(); await b.sync();
    a.edit('l1', { protein: 11 });
    b.edit('l1', { protein: 22 }); // later than A's edit
    await a.sync(); await b.sync(); await a.sync();
    expect(a.data.logs[0].protein).toBe(22);
    expect(b.data.logs[0].protein).toBe(22);
  });

  it('exact-same-timestamp conflicts still converge (no ping-pong)', async () => {
    const { a, b } = setup();
    a.log('l1', '2026-11-20', 10);
    await a.sync(); await b.sync();
    a.data.logs[0] = { ...a.data.logs[0], protein: 11, updatedAt: 5_000_000 };
    b.data.logs[0] = { ...b.data.logs[0], protein: 22, updatedAt: 5_000_000 };
    await a.sync(); await b.sync(); await a.sync(); await b.sync();
    expect(a.data.logs[0].protein).toBe(b.data.logs[0].protein);
    const w = a.remote.writes;
    await a.sync(); await b.sync();
    expect(a.remote.writes).toBe(w); // stable: nothing left to write
  });

  it('moving a log to another month leaves exactly one copy', async () => {
    const { remote, a, b } = setup();
    a.log('l1', '2026-11-30'); a.log('keep', '2026-11-30');
    await a.sync(); await b.sync();
    a.edit('l1', { date: '2026-12-01' });
    await a.sync(); await b.sync();
    expect(remote.text('logs/2026-11.json')).not.toContain('"id":"l1"');
    expect(remote.text('logs/2026-12.json')).toContain('"id":"l1"');
    expect(b.data.logs.filter(l => l.id === 'l1')).toHaveLength(1);
    expect(b.data.logs.find(l => l.id === 'l1')!.date).toBe('2026-12-01');
  });

  it('is efficient: an unchanged sync makes no reads and no writes', async () => {
    const { remote, a } = setup();
    a.log('l1', '2026-11-20'); a.log('l2', '2026-10-02');
    await a.sync();
    const [r, w] = [remote.reads, remote.writes];
    const out = await a.sync();
    expect(out.filesRead).toBe(0);
    expect(out.filesWritten).toBe(0);
    expect(remote.reads).toBe(r);
    expect(remote.writes).toBe(w);
  });

  it('only the changed month file is rewritten and re-read by the other device', async () => {
    const { remote, a, b } = setup();
    a.log('old', '2026-09-01'); a.log('cur', '2026-11-20');
    await a.sync(); await b.sync();
    const w = remote.writes; const r = remote.reads;
    a.log('new', '2026-11-21');
    const out = await a.sync();
    expect(out.filesWritten).toBe(1);
    expect(remote.writes - w).toBe(1);
    const outB = await b.sync();
    expect(outB.filesRead).toBe(1);
    expect(remote.reads - r).toBe(1);
    expect(b.live()).toEqual(['cur', 'new', 'old']);
  });

  it('retries on a write conflict (another device wrote in between) and still converges', async () => {
    const { remote, a, b } = setup();
    a.log('l1', '2026-11-20');
    await a.sync(); await b.sync();
    a.log('from-a', '2026-11-21');
    b.log('from-b', '2026-11-22');
    let injected = false;
    remote.beforeWrite = () => { if (!injected) { injected = true; remote.beforeWrite = undefined; void b.sync(); } };
    await a.sync(); // A's first write is rejected as stale because B's sync lands first; A re-reads, merges, writes again
    await new Promise(r => setTimeout(r, 0));
    await b.sync(); await a.sync();
    expect(a.live()).toEqual(['from-a', 'from-b', 'l1']);
    expect(b.live()).toEqual(['from-a', 'from-b', 'l1']);
  });

  it('import/restore on one device can make the cloud copy match it (authoritative)', async () => {
    const { a, b } = setup();
    a.log('keep', '2026-11-20'); a.log('later', '2026-11-21');
    await a.sync(); await b.sync();
    // B restores an older backup that only contains "keep" and then syncs as the source of truth
    b.data.logs = b.data.logs.filter(l => l.id === 'keep');
    b.config = { ...b.config, authoritative: true };
    const out = await b.sync();
    expect(out.config.authoritative).toBe(false);
    await a.sync();
    expect(a.live()).toEqual(['keep']);
    expect(a.data.logs.find(l => l.id === 'later')?.deletedAt).toBeDefined(); // recoverable from A's trash
  });

  it('does not overwrite anything when a remote file is corrupt', async () => {
    const { remote, a, b } = setup();
    a.log('l1', '2026-11-20');
    await a.sync();
    remote.files.set('logs/2026-11.json', { text: '<<<garbage', sha: 'zz' });
    b.log('mine', '2026-11-22');
    await expect(b.sync()).rejects.toMatchObject({ kind: 'other', message: expect.stringContaining('not valid Demeter data') });
    expect(remote.text('logs/2026-11.json')).toBe('<<<garbage');
    expect(b.live()).toEqual(['mine']);
  });

  it('network failure leaves local data untouched and is reported as a network error', async () => {
    const { remote, a } = setup();
    a.log('l1', '2026-11-20');
    remote.failWith = new SyncError('network', 'offline');
    await expect(a.sync()).rejects.toMatchObject({ kind: 'network' });
    expect(a.live()).toEqual(['l1']);
    remote.failWith = undefined;
    await a.sync();
    expect(remote.files.size).toBeGreaterThan(0);
  });

  it('signals when the user edited locally during the sync so it can run again', async () => {
    const { a, b } = setup();
    b.log('l1', '2026-11-20');
    await b.sync();
    const out = runSync({
      remote: a.remote, config: a.config, now: () => tick(),
      loadLocal: async () => structuredClone(a.data),
      saveLocal: async (_m, base) => { a.log('typed-meanwhile', '2026-11-25'); if (fingerprint(a.data) !== fingerprint(base)) throw new LocalChangedError(); },
    });
    await expect(out).rejects.toBeInstanceOf(LocalChangedError);
    expect(a.live()).toEqual(['typed-meanwhile']); // nothing was lost
  });

  it('forgets tombstones after 60 days and does not resurrect them', async () => {
    const { remote, a } = setup();
    const DAY = 86_400_000;
    a.log('gone', '2026-11-20');
    await a.sync(1_000_000);
    a.data.logs[0] = { ...a.data.logs[0], deletedAt: 1_000_000, updatedAt: 1_000_000 };
    await a.sync(1_000_000 + 10 * DAY);
    expect(remote.text('logs/2026-11.json')).toContain('"deletedAt"');
    await a.sync(1_000_000 + 70 * DAY);
    expect(a.data.logs).toHaveLength(0);
    expect(remote.text('logs/2026-11.json')).not.toContain('"id":"gone"');
  });
});

describe('github client (request shapes & error mapping)', () => {
  const mk = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
    new GitHubClient({ token: 'tok', repo: 'me/demeter-data', branch: 'main', fetchImpl: (async (u: RequestInfo | URL, i?: RequestInit) => handler(String(u), i ?? {})) as typeof fetch });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('lists only Demeter files from the tree, and treats an empty repo as no files', async () => {
    const c = mk(() => json({ tree: [{ path: 'README.md', type: 'blob', sha: '1' }, { path: 'foods.json', type: 'blob', sha: '2' }, { path: 'logs', type: 'tree', sha: '3' }, { path: 'logs/2026-11.json', type: 'blob', sha: '4' }] }));
    expect(await c.listFiles()).toEqual({ 'foods.json': '2', 'logs/2026-11.json': '4' });
    expect(await mk(() => json({ message: 'Git Repository is empty.' }, 409)).listFiles()).toEqual({});
  });

  it('sends the token, never caches, and writes UTF-8 as base64 with the sha', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const c = mk((url, init) => { seen = { url, init }; return json({ content: { sha: 'new' } }, 200); });
    const sha = await c.writeFile('foods.json', '{"x":"Crème brûlée 🍰"}', 'old', 'msg');
    expect(sha).toBe('new');
    expect(seen!.url).toBe('https://api.github.com/repos/me/demeter-data/contents/foods.json');
    expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(seen!.init.cache).toBe('no-store');
    const body = JSON.parse(seen!.init.body as string);
    expect(body).toMatchObject({ message: 'msg', branch: 'main', sha: 'old' });
    expect(new TextDecoder().decode(Uint8Array.from(atob(body.content), c => c.charCodeAt(0)))).toBe('{"x":"Crème brûlée 🍰"}');
    expect(toBase64Utf8('é')).toBe(btoa(String.fromCharCode(0xc3, 0xa9)));
  });

  it('maps failures to clear error kinds', async () => {
    await expect(mk(() => json({ message: 'Bad credentials' }, 401)).getRepo()).rejects.toMatchObject({ kind: 'auth' });
    await expect(mk(() => json({ message: 'Not Found' }, 404)).getRepo()).rejects.toMatchObject({ kind: 'auth', message: expect.stringContaining('no access') });
    await expect(mk(() => json({ message: 'API rate limit exceeded' }, 403)).listFiles()).rejects.toMatchObject({ kind: 'network' });
    await expect(mk(() => { throw new TypeError('Failed to fetch'); }).listFiles()).rejects.toMatchObject({ kind: 'network' });
    await expect(mk(() => json({ message: 'x' }, 500)).readFile('foods.json')).rejects.toMatchObject({ kind: 'other' });
  });

  it('treats a stale sha as a conflict but other 422s as real errors', async () => {
    await expect(mk(() => json({ message: 'foods.json does not match abc' }, 409)).writeFile('foods.json', '{}', 'abc', 'm')).rejects.toBeInstanceOf(SyncConflict);
    await expect(mk(() => json({ message: "Invalid request. \"sha\" wasn't supplied." }, 422)).writeFile('foods.json', '{}', undefined, 'm')).rejects.toBeInstanceOf(SyncConflict);
    await expect(mk(() => json({ message: 'Branch nope not found' }, 422)).writeFile('foods.json', '{}', undefined, 'm')).rejects.toMatchObject({ kind: 'other' });
  });

  it('reports privacy and push permission of the repository', async () => {
    expect(await mk(() => json({ private: true, default_branch: 'main', full_name: 'me/demeter-data', permissions: { push: true } })).getRepo()).toMatchObject({ isPrivate: true, canPush: true });
    expect(await mk(() => json({ private: false, default_branch: 'main', full_name: 'me/x', permissions: { push: false } })).getRepo()).toMatchObject({ isPrivate: false, canPush: false });
  });

  it('parses repo input', () => {
    expect(parseRepoInput('me/demeter-data')).toBe('me/demeter-data');
    expect(parseRepoInput('https://github.com/me/demeter-data.git')).toBe('me/demeter-data');
    expect(parseRepoInput('  https://github.com/me/demeter-data/  ')).toBe('me/demeter-data');
    expect(parseRepoInput('nonsense')).toBeNull();
  });
});
