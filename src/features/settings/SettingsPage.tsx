import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, Confirm, Field, Notice, PageHeader, SectionTitle, Segmented } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Icon } from '../../components/ui/Icon';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { parseBackup, type ParseResult } from '../../db/backup';
import { fmtNum } from '../../lib/engine';
import { SyncSection } from './SyncSection';
import type { DailyTargets, ThemePref } from '../../types';

declare const __APP_VERSION__: string | undefined;
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0';

export function SettingsPage() {
  const settings = useAppStore(s => s.settings);
  const targets = useAppStore(s => s.targets);
  const setTargets = useAppStore(s => s.setTargets);
  const update = useAppStore(s => s.updateSettings);
  const persisted = useAppStore(s => s.persisted);
  const logCount = useAppStore(s => s.logs.length);
  const recipeCount = useAppStore(s => s.recipes.length);
  const foodCount = useAppStore(s => s.customFoods.length);
  const counts = { logs: logCount, recipes: recipeCount, foods: foodCount };

  // ---- targets: edit locally, save shortly after typing stops.
  // Only real edits are saved (never "because the stored object changed"), and values arriving from another device
  // (sync) are shown unless you are in the middle of typing.
  const [t, setT] = useState<DailyTargets>(targets);
  const editing = useRef(false);
  const edit = (patch: Partial<DailyTargets>) => { editing.current = true; setT(x => ({ ...x, ...patch })); };
  useEffect(() => {
    if (!editing.current) return;
    const id = setTimeout(() => { editing.current = false; void setTargets(t); }, 450);
    return () => clearTimeout(id);
  }, [t, setTargets]);
  useEffect(() => { if (!editing.current) setT(targets); }, [targets]);
  const kcalFromMacros = Math.round(t.protein * 4 + t.carbs * 4 + t.fat * 9);

  return (
    <>
      <PageHeader title="Settings" subtitle="Everything is stored on this device" />
      <main className="px-4 pb-10 max-w-xl mx-auto">
        <SectionTitle>Daily targets</SectionTitle>
        <Card className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={<span className="text-protein">Protein</span>}><NumInput value={t.protein} onChange={v => edit({ protein: v ?? 0 })} suffix="g" decimals={0} /></Field>
            <Field label={<span className="text-kcal">Calories</span>}><NumInput value={t.calories} onChange={v => edit({ calories: v ?? 0 })} suffix="kcal" decimals={0} /></Field>
            <Field label={<span className="text-carbs">Carbs</span>}><NumInput value={t.carbs} onChange={v => edit({ carbs: v ?? 0 })} suffix="g" decimals={0} /></Field>
            <Field label={<span className="text-fat">Fat</span>}><NumInput value={t.fat} onChange={v => edit({ fat: v ?? 0 })} suffix="g" decimals={0} /></Field>
            <Field label={<span className="text-fiber">Fibre</span>}><NumInput value={t.fiber ?? null} onChange={v => edit({ fiber: v ?? undefined })} suffix="g" decimals={0} /></Field>
          </div>
          <p className="text-[12px] text-muted">Your macro targets add up to about {fmtNum(kcalFromMacros, 0)} kcal.</p>
        </Card>

        <SectionTitle>Appearance</SectionTitle>
        <Card>
          <Segmented<ThemePref> value={settings.theme} onChange={v => update({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Automatic' }]} />
        </Card>

        <SyncSection />

        <BackupSection counts={counts} />

        <SafetyNets />

        <SectionTitle>Storage</SectionTitle>
        <Card className="space-y-2.5 text-[15px]">
          <div className="flex items-center gap-2"><Icon name="shield" className={persisted ? 'text-ok' : 'text-warn'} />
            <span>{persisted ? 'Persistent storage granted' : 'Persistent storage not guaranteed'}</span></div>
          <p className="text-[13px] text-muted leading-snug">
            {persisted ? 'Safari will not clear Demeter’s data when space runs low.' : 'iOS may clear a website’s data after about 7 days of not opening it. Installed to the Home Screen and opened regularly, Demeter is exempt from that cleanup — but keep a JSON backup anyway.'}
          </p>
          <StorageEstimate />
        </Card>

        <SectionTitle>Online features</SectionTitle>
        <Card className="space-y-1">
          <label className="flex items-center justify-between min-h-12">
            <span><span className="block text-[16px]">Packaged-product lookup</span><span className="block text-[13px] text-muted">Open Food Facts · only when you ask for it</span></span>
            <input type="checkbox" checked={settings.onlineLookupEnabled} onChange={e => update({ onlineLookupEnabled: e.target.checked })} className="h-6 w-6 accent-[var(--accent)]" />
          </label>
        </Card>

        <SectionTitle>Prices</SectionTitle>
        <Card className="space-y-1">
          <label className="flex items-center justify-between gap-4 min-h-12">
            <span><span className="block text-[16px]">Currency symbol</span><span className="block text-[13px] text-muted">Used for prices and costs on this device</span></span>
            <input
              value={settings.currency ?? '€'} maxLength={3} aria-label="Currency symbol" onChange={e => update({ currency: e.target.value })}
              onBlur={e => { if (!e.target.value.trim()) update({ currency: '€' }); }}
              className="w-16 h-11 rounded-xl bg-surface2 text-center text-[18px] font-semibold outline-none border border-transparent focus:border-accent"
            />
          </label>
        </Card>

        <SectionTitle>Help</SectionTitle>
        <Card className="!p-0 overflow-hidden">
          <button className="w-full flex items-center justify-between px-4 h-14 text-left active:bg-surface2" onClick={() => useUI.setState({ introOpen: true })}>
            <span>How raw-to-cooked works</span><Icon name="chevR" size={18} className="text-muted" />
          </button>
        </Card>

        <DangerZone />

        <p className="text-center text-[12px] text-muted mt-8 leading-relaxed">
          Demeter {VERSION} · no account, no ads, no analytics<br />
          Nutrition data: USDA FoodData Central (public domain) and typical label values.<br />
          Optional product lookup: Open Food Facts (ODbL).
        </p>
      </main>
    </>
  );
}

function StorageEstimate() {
  const [text, setText] = useState('');
  useEffect(() => {
    navigator.storage?.estimate?.().then(e => { if (e.usage != null) setText(`Using ${(e.usage / 1024).toFixed(0)} KB on this device`); }).catch(() => {});
  }, []);
  return text ? <p className="text-[13px] text-muted">{text}</p> : null;
}

function BackupSection({ counts }: { counts: { logs: number; recipes: number; foods: number } }) {
  const exportJSON = useAppStore(s => s.exportJSON);
  const markExported = useAppStore(s => s.markExported);
  const importAll = useAppStore(s => s.importAll);
  const showToast = useAppStore(s => s.showToast);
  const settings = useAppStore(s => s.settings);
  const update = useAppStore(s => s.updateSettings);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Extract<ParseResult, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doExport = async () => {
    const { text, fileName } = exportJSON();
    const file = new File([text], fileName, { type: 'application/json' });
    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Demeter backup' });
        await markExported(); showToast('Backup exported', { tone: 'success' });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return; // user closed the share sheet
    }
    download(text, fileName);
    await markExported(); showToast('Backup downloaded', { tone: 'success' });
  };
  const doDownload = async () => { const { text, fileName } = exportJSON(); download(text, fileName); await markExported(); showToast('Backup downloaded', { tone: 'success' }); };

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (!parsed.ok) { setError(parsed.error); return; }
    setPending(parsed);
  };
  const lastExport = settings.lastExportAt ? new Date(settings.lastExportAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never';

  return (
    <>
      <SectionTitle>Backup & restore</SectionTitle>
      <Card className="space-y-3">
        <p className="text-[14px] text-muted leading-snug">Your data lives only on this iPhone. Export a JSON file to the <b className="text-ink">Files app / iCloud Drive</b> now and then. Last backup: <b className="text-ink">{lastExport}</b>. Currently {counts.logs} log {counts.logs === 1 ? 'entry' : 'entries'}, {counts.recipes} {counts.recipes === 1 ? 'recipe' : 'recipes'}, {counts.foods} custom {counts.foods === 1 ? 'food' : 'foods'}.</p>
        <Button variant="primary" size="lg" block icon="upload" onClick={doExport}>Export all data as JSON</Button>
        <Button block icon="download" variant="secondary" onClick={() => fileRef.current?.click()}>Import JSON backup</Button>
        <button className="block mx-auto text-[13px] text-muted underline underline-offset-2" onClick={doDownload}>Download the file instead of sharing</button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
        {error && <Notice tone="error">{error}</Notice>}
        <Field label="Remind me to back up">
          <select value={settings.backupReminderDays} onChange={e => update({ backupReminderDays: Number(e.target.value) })} className="w-full h-12 rounded-2xl bg-surface2 px-4 text-[16px] outline-none">
            <option value={0}>Never</option><option value={7}>Every week</option><option value={14}>Every 2 weeks</option><option value={30}>Every month</option>
          </select>
        </Field>
      </Card>
      <Confirm
        open={!!pending} danger title="Replace all data with this backup?" confirmLabel="Replace everything"
        message={pending && (
          <>The backup (exported {pending.summary.exportedAt.slice(0, 10)}) has <b className="text-ink">{pending.summary.logs} log entries, {pending.summary.recipes} recipes and {pending.summary.foods} custom foods</b>.
            Importing <b className="text-ink">overwrites</b> what is on this device now ({counts.logs} entries, {counts.recipes} recipes, {counts.foods} foods). Export first if you are unsure.</>
        )}
        onCancel={() => setPending(null)}
        onConfirm={async () => { if (pending) { await importAll(pending.data); setPending(null); showToast('Backup restored', { tone: 'success' }); } }}
      />
    </>
  );
}

function download(text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function DangerZone() {
  const eraseAll = useAppStore(s => s.eraseAll);
  const showToast = useAppStore(s => s.showToast);
  const [open, setOpen] = useState(false);
  return (
    <>
      <SectionTitle>Danger zone</SectionTitle>
      <Card className="border-danger/40 space-y-3">
        <p className="text-[14px] text-muted leading-snug">Permanently erase every log entry, recipe, custom food and setting on this device. Export a backup first — this cannot be undone.</p>
        <Button variant="danger" block icon="trash" onClick={() => setOpen(true)}>Erase all local data…</Button>
      </Card>
      <Confirm open={open} danger title="Erase everything?" confirmLabel="Erase all data"
        message="All logs, recipes, custom foods, favorites and settings on this device will be deleted, and sync is disconnected (the copy in your GitHub repository is left alone). Demeter keeps a restore point so you can undo this from Settings. The built-in food database stays."
        onCancel={() => setOpen(false)}
        onConfirm={async () => { await eraseAll(); setOpen(false); showToast('All local data erased'); }} />
    </>
  );
}

function SafetyNets() {
  const trash = useAppStore(s => s.trash);
  const restorePoint = useAppStore(s => s.restorePoint);
  const restore = useAppStore(s => s.restoreFromRestorePoint);
  const showToast = useAppStore(s => s.showToast);
  const [confirm, setConfirm] = useState(false);
  const n = trash.logs.length + trash.foods.length + trash.recipes.length;
  const when = restorePoint ? new Date(restorePoint.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const why = restorePoint?.reason === 'import' ? 'before an import' : restorePoint?.reason === 'erase' ? 'before erasing everything' : 'before the last restore';
  return (
    <>
      <SectionTitle>Undo & safety nets</SectionTitle>
      <Card className="!p-0 overflow-hidden">
        <button className="w-full flex items-center justify-between px-4 min-h-14 text-left active:bg-surface2" onClick={() => useUI.setState({ trashOpen: true })}>
          <span><span className="block text-[16px]">Recently deleted</span><span className="block text-[13px] text-muted">{n === 0 ? 'Nothing here' : `${n} item${n === 1 ? '' : 's'} you can restore`} · kept 60 days</span></span>
          <Icon name="chevR" size={18} className="text-muted" />
        </button>
        {restorePoint && (
          <div className="px-4 py-3 border-t border-line/60 space-y-2">
            <div className="text-[14px]"><b>Restore point</b> <span className="text-muted">saved {why}, {when}</span></div>
            <Button block variant="secondary" icon="refresh" onClick={() => setConfirm(true)}>Restore previous data</Button>
          </div>
        )}
      </Card>
      <Confirm open={confirm} title="Restore previous data?" confirmLabel="Restore"
        message="Your current data is replaced by the saved copy. The data being replaced becomes the new restore point, so you can switch back."
        onCancel={() => setConfirm(false)} onConfirm={async () => { await restore(); setConfirm(false); showToast('Previous data restored', { tone: 'success' }); }} />
    </>
  );
}
