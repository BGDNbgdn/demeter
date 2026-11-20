import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { useAppStore } from '../../hooks/useAppStore';

/** Shown on Today only when sync needs your attention (expired token, public repo…). Network hiccups stay silent. */
export function SyncAlert() {
  const sync = useAppStore(s => s.sync);
  const navigate = useNavigate();
  if (!sync.configured || sync.status !== 'error' || !sync.error) return null;
  return (
    <button onClick={() => navigate('/settings')} className="mt-3 w-full flex items-start gap-3 rounded-2xl bg-danger/12 text-left px-4 py-3 text-[14px]" style={{ background: 'color-mix(in srgb, var(--danger) 12%, transparent)' }}>
      <Icon name="alert" className="text-danger shrink-0 mt-0.5" size={20} />
      <span className="flex-1"><b className="text-danger">Sync paused.</b> {sync.error.message} <span className="text-accent font-semibold">Open Settings</span></span>
    </button>
  );
}
