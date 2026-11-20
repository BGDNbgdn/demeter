/**
 * Minimal GitHub REST client for syncing JSON files into a PRIVATE repository.
 * Runs in the browser (api.github.com allows CORS) with a fine-grained personal access token.
 */
import type { SyncErrorKind } from '../../types';
import { isSyncedPath } from './merge';

export class SyncError extends Error {
  constructor(public kind: SyncErrorKind, message: string, public status?: number) { super(message); }
}
/** The file changed on GitHub between reading and writing — read again and merge again. */
export class SyncConflict extends Error { constructor() { super('Remote file changed'); } }

export interface RemoteStore {
  /** path → blob sha, for the files Demeter syncs */
  listFiles(): Promise<Record<string, string>>;
  readFile(path: string): Promise<string>;
  /** returns the new blob sha; throws SyncConflict when `sha` is stale */
  writeFile(path: string, text: string, sha: string | undefined, message: string): Promise<string>;
}

export interface RepoInfo { isPrivate: boolean; canPush: boolean; defaultBranch: string; fullName: string }

type FetchLike = typeof fetch;

export function parseRepoInput(input: string): string | null {
  const t = input.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return /^[\w.-]+\/[\w.-]+$/.test(t) ? t : null;
}

export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export class GitHubClient implements RemoteStore {
  constructor(private opts: { token: string; repo: string; branch: string; fetchImpl?: FetchLike }) {}

  private get api() { return `https://api.github.com/repos/${this.opts.repo}`; }

  private async call(url: string, init: RequestInit & { raw?: boolean } = {}): Promise<Response> {
    const f = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await f(url, {
        ...init,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${this.opts.token}`,
          Accept: init.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
      });
    } catch {
      throw new SyncError('network', 'Could not reach GitHub. Check your connection.');
    }
    return res;
  }

  private async fail(res: Response, what: string): Promise<never> {
    let detail = '';
    try { detail = ((await res.json()) as { message?: string }).message ?? ''; } catch { /* ignore */ }
    if (res.status === 401) throw new SyncError('auth', 'The GitHub token is invalid or has expired. Create a new one and reconnect.', 401);
    if (res.status === 403 && /rate limit/i.test(detail)) throw new SyncError('network', 'GitHub rate limit reached — will retry later.', 403);
    if (res.status === 403) throw new SyncError('auth', `GitHub refused access (${detail || 'forbidden'}). The token needs Contents: Read and write on the data repository.`, 403);
    if (res.status === 404) throw new SyncError('auth', 'Repository not found, or the token has no access to it.', 404);
    throw new SyncError('other', `GitHub error while ${what} (${res.status}${detail ? `: ${detail}` : ''}).`, res.status);
  }

  async getRepo(): Promise<RepoInfo> {
    const res = await this.call(this.api);
    if (!res.ok) return this.fail(res, 'checking the repository');
    const j = (await res.json()) as { private: boolean; default_branch: string; full_name: string; permissions?: { push?: boolean } };
    return { isPrivate: j.private === true, canPush: j.permissions ? !!j.permissions.push : true, defaultBranch: j.default_branch, fullName: j.full_name };
  }

  async listFiles(): Promise<Record<string, string>> {
    const res = await this.call(`${this.api}/git/trees/${encodeURIComponent(this.opts.branch)}?recursive=1`);
    if (res.status === 409) return {}; // empty repository
    if (!res.ok) return this.fail(res, 'listing files');
    const j = (await res.json()) as { tree: Array<{ path: string; type: string; sha: string }> };
    const out: Record<string, string> = {};
    for (const e of j.tree) if (e.type === 'blob' && isSyncedPath(e.path)) out[e.path] = e.sha;
    return out;
  }

  async readFile(path: string): Promise<string> {
    const res = await this.call(`${this.api}/contents/${path}?ref=${encodeURIComponent(this.opts.branch)}`, { raw: true });
    if (!res.ok) return this.fail(res, `reading ${path}`);
    return res.text();
  }

  async writeFile(path: string, text: string, sha: string | undefined, message: string): Promise<string> {
    const res = await this.call(`${this.api}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: toBase64Utf8(text), branch: this.opts.branch, ...(sha ? { sha } : {}) }),
    });
    if (res.status === 409) throw new SyncConflict();
    if (res.status === 422) {
      // 422 is also used for other validation errors (e.g. unknown branch); only a stale/missing sha is a merge conflict
      let detail = '';
      try { detail = ((await res.clone().json()) as { message?: string }).message ?? ''; } catch { /* ignore */ }
      if (/sha|does not match|expected/i.test(detail)) throw new SyncConflict();
      throw new SyncError('other', `GitHub rejected the write to ${path} (${detail || '422'}). Does the branch "${this.opts.branch}" exist?`, 422);
    }
    if (!res.ok) return this.fail(res, `writing ${path}`);
    const j = (await res.json()) as { content: { sha: string } };
    return j.content.sha;
  }
}
