import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/Icon';
import { useAppStore } from '../../hooks/useAppStore';

/** Gentle nudge to export a backup (Safari can evict site data if a web app is unused for a long time). */
export function BackupReminder() {
  const settings = useAppStore(s => s.settings);
  const logCount = useAppStore(s => s.logs.length);
  const [hidden, setHidden] = useState(false);
  const navigate = useNavigate();
  const days = settings.backupReminderDays;
  if (hidden || !days || logCount < 5) return null;
  const last = settings.lastExportAt ?? settings.createdAt;
  const age = Math.floor((Date.now() - last) / 86_400_000);
  if (age < days) return null;
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-accentsoft text-ink px-4 py-3 text-[14px]">
      <Icon name="shield" className="text-accent shrink-0" />
      <button className="flex-1 text-left" onClick={() => navigate('/settings')}>
        {settings.lastExportAt ? `Last backup was ${age} days ago.` : 'You have not backed up yet.'} <b className="text-accent">Export a backup</b>
      </button>
      <button aria-label="Dismiss" className="text-muted h-8 w-8" onClick={() => setHidden(true)}><Icon name="x" size={18} /></button>
    </div>
  );
}
