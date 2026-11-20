import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, Confirm, Field, Notice, SectionTitle, TextInput } from '../../components/ui/misc';
import { useAppStore } from '../../hooks/useAppStore';
import { connectSync, disconnectSync } from '../../lib/sync/orchestrator';

/** Suggested repository name — create it once as PRIVATE on GitHub. */
export const DEFAULT_SYNC_REPO = 'BGDNbgdn/demeter-data';
const TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new?name=Demeter%20sync&description=Demeter%20app%20sync&expires_in=365&contents=write';

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function SyncSection() {
  const sync = useAppStore(s => s.sync);
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState(DEFAULT_SYNC_REPO);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const showToast = useAppStore(s => s.showToast);

  const connect = async () => {
    setBusy(true); setError(null);
    const r = await connectSync(token, repoName);
    setBusy(false);
    if (r.ok) { setToken(''); showToast('Sync connected', { tone: 'success' }); } else setError(r.error);
  };

  if (sync.configured) {
    const status =
      sync.status === 'syncing' ? { t: 'Syncing…', c: 'var(--calories)' }
      : sync.status === 'error' ? { t: sync.error?.message ?? 'Sync problem', c: 'var(--danger)' }
      : sync.status === 'offline' ? { t: 'Offline — will sync when you are back online', c: 'var(--warn)' }
      : { t: `Up to date${sync.lastSyncAt ? ` · synced ${timeAgo(sync.lastSyncAt)}` : ''}`, c: 'var(--ok)' };
    return (
      <>
        <SectionTitle>Sync across devices</SectionTitle>
        <Card className="space-y-3">
          <div className="flex items-start gap-3">
            <Icon name="shield" className="text-ok shrink-0 mt-0.5" />
            <div className="min-w-0">
              <div className="text-[16px] font-semibold">Connected to a private GitHub repo</div>
              <div className="text-[13px] text-muted break-all">{sync.repo}</div>
            </div>
          </div>
          <div className="rounded-2xl bg-surface2 px-4 py-3 text-[14px]" style={{ color: status.c }} data-testid="sync-status">{status.t}</div>
          <p className="text-[13px] text-muted leading-snug">Demeter syncs by itself: when you open it, when you come back to it, and a few seconds after you change something. Only you can read the repository. Your token stays on this device and is never part of a backup.</p>
          <Button block variant="secondary" onClick={() => setConfirmOff(true)}>Disconnect this device</Button>
        </Card>
        <Confirm open={confirmOff} danger title="Disconnect sync?" confirmLabel="Disconnect"
          message="This device stops syncing and forgets the token. Your data stays on this device and in the GitHub repository."
          onCancel={() => setConfirmOff(false)} onConfirm={async () => { await disconnectSync(); setConfirmOff(false); showToast('Sync disconnected'); }} />
      </>
    );
  }

  return (
    <>
      <SectionTitle>Sync across devices</SectionTitle>
      <Card className="space-y-3">
        <p className="text-[14px] text-muted leading-snug">Keep your iPhone and other devices in step using <b className="text-ink">your own private GitHub repository</b> — free, and only you can read it.</p>
        <ol className="text-[13px] text-muted leading-snug list-decimal pl-5 space-y-1">
          <li>On GitHub, create a <b className="text-ink">private</b> repository (e.g. <code>demeter-data</code>).</li>
          <li><a className="text-accent font-semibold" href={TOKEN_URL} target="_blank" rel="noreferrer">Create a fine-grained token</a>: <i>Only select repositories</i> → that repo, permission <b className="text-ink">Contents: Read and write</b>.</li>
          <li>Paste the token below. Do the same on each device.</li>
        </ol>
        <Field label="Repository"><TextInput value={repoName} onChange={e => setRepoName(e.target.value)} placeholder="yourname/demeter-data" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></Field>
        <Field label="Token"><TextInput type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="github_pat_…" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} aria-label="GitHub token" /></Field>
        {error && <Notice tone="error">{error}</Notice>}
        <Button variant="primary" size="lg" block disabled={busy || !token.trim()} onClick={connect}>{busy ? 'Connecting…' : 'Connect and sync'}</Button>
        <p className="text-[12px] text-muted leading-snug">Demeter refuses to sync to a public repository. If this device already has data, it is merged with what is in the repository — nothing is overwritten.</p>
      </Card>
    </>
  );
}
