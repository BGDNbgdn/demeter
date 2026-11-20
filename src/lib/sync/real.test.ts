/**
 * Opt-in integration test against the REAL GitHub API (skipped unless DEMETER_SYNC_TOKEN is set).
 *   DEMETER_SYNC_TOKEN=$(gh auth token) DEMETER_SYNC_REPO=owner/demeter-data DEMETER_SYNC_BRANCH=sync-test npx vitest run src/lib/sync/real.test.ts
 * Use a scratch branch — the test writes files to it.
 */
import { describe, expect, it } from 'vitest';
import { GitHubClient } from './github';
import { Device, FakeRemote } from './testing';

const token = process.env.DEMETER_SYNC_TOKEN;
const repo = process.env.DEMETER_SYNC_REPO ?? '';
const branch = process.env.DEMETER_SYNC_BRANCH ?? 'sync-test';

describe.skipIf(!token)('real GitHub private repo', () => {
  const client = () => new GitHubClient({ token: token!, repo, branch });
  // two devices sharing the real remote (Device expects a FakeRemote type but only uses the RemoteStore interface)
  const mk = (name: string) => new Device(client() as unknown as FakeRemote, name);

  it('repo is private and writable', async () => {
    const info = await client().getRepo();
    expect(info.isPrivate).toBe(true);
    expect(info.canPush).toBe(true);
  });

  it('two devices sync through the real API: upload, pull, edit, delete, restore, unicode, conflict', async () => {
    const a = mk('A'); const b = mk('B');
    a.log('real-1', '2026-11-20', 40);
    a.data.logs[0].name = 'Crème brûlée 🍰';
    a.food('real-food'); a.recipe('real-recipe');
    const first = await a.sync();
    expect(first.filesWritten).toBeGreaterThanOrEqual(4);

    const pulled = await b.sync();
    expect(pulled.changedLocal).toBe(true);
    expect(b.data.logs[0].name).toBe('Crème brûlée 🍰');
    expect(b.data.foods.map(f => f.id)).toEqual(['real-food']);

    const idle = await a.sync();
    expect(idle.filesWritten).toBe(0);
    expect(idle.filesRead).toBe(0);

    b.edit('real-1', { protein: 99 });
    await b.sync(); await a.sync();
    expect(a.data.logs[0].protein).toBe(99);

    a.remove('real-1'); await a.sync(); await b.sync();
    expect(b.live()).toEqual([]);
    b.restore('real-1'); await b.sync(); await a.sync();
    expect(a.live()).toEqual(['real-1']);

    // simultaneous writes → one of them hits GitHub's stale-sha rule and must retry
    a.log('from-a', '2026-11-21'); b.log('from-b', '2026-11-21');
    await Promise.all([a.sync(), b.sync()]);
    await a.sync(); await b.sync(); await a.sync();
    expect(a.live()).toEqual(['from-a', 'from-b', 'real-1']);
    expect(b.live()).toEqual(['from-a', 'from-b', 'real-1']);
  }, 120_000);
});
