import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Notice, Segmented, TextInput } from '../../components/ui/misc';
import { Sheet } from '../../components/ui/Sheet';
import { useUI } from '../../hooks/useUI';
import { fmtNum } from '../../lib/engine';
import { OffError, lookupBarcode, offToFoodPrefill, searchProducts, type OffProduct } from '../../lib/openFoodFacts';
import { BarcodeScanner } from './BarcodeScanner';

/** Optional online lookup (Open Food Facts). Always offers a manual fallback. */
export function OffSheet() {
  const open = useUI(s => s.offOpen);
  if (!open) return null;
  return <Inner />;
}

function Inner() {
  const close = () => useUI.setState({ offOpen: false });
  const [tab, setTab] = useState<'search' | 'barcode'>('search');
  const [q, setQ] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<OffError | null>(null);
  const [results, setResults] = useState<OffProduct[] | null>(null);
  const [scanning, setScanning] = useState(false);

  const use = (p: OffProduct) => { close(); useUI.setState({ foodForm: { prefill: offToFoodPrefill(p), logAfter: true } }); };
  const manual = () => { close(); useUI.setState({ foodForm: { name: q.trim() || undefined, logAfter: true } }); };
  const fail = (e: unknown) => setError(e instanceof OffError ? e : new OffError('http', 'Something went wrong with the online lookup.'));

  const doSearch = async () => {
    setBusy(true); setError(null); setResults(null);
    try { setResults(await searchProducts(q)); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const doBarcode = async (c: string) => {
    setBusy(true); setError(null); setScanning(false);
    try { use(await lookupBarcode(c)); } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Sheet open onClose={close} tall title="Packaged product lookup" zIndex={72}>
      <div className="space-y-4 pt-1">
        <Notice tone="info"><span className="text-[13px]">Optional and online-only — powered by Open Food Facts. Demeter works fully without it. Values are community-contributed: check them against the label.</span></Notice>
        <Segmented value={tab} onChange={t => { setTab(t); setError(null); setScanning(false); }} options={[{ value: 'search', label: 'Search by name' }, { value: 'barcode', label: 'Barcode' }]} />

        {tab === 'search' ? (
          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void doSearch(); }}>
            <TextInput value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. skyr vanilla" autoFocus enterKeyHint="search" className="flex-1" aria-label="Product name" />
            <Button variant="primary" type="submit" disabled={busy || q.trim().length < 2}>{busy ? '…' : 'Search'}</Button>
          </form>
        ) : (
          <div className="space-y-3">
            {scanning ? <BarcodeScanner onDetect={c => void doBarcode(c)} /> : <Button block icon="scan" onClick={() => { setScanning(true); setError(null); }}>Scan with camera</Button>}
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void doBarcode(code); }}>
              <TextInput value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="or type the barcode number" className="flex-1" aria-label="Barcode number" />
              <Button variant="primary" type="submit" disabled={busy || code.length < 6}>{busy ? '…' : 'Look up'}</Button>
            </form>
          </div>
        )}

        {error && (
          <Notice tone={error.kind === 'offline' ? 'warn' : 'error'}>
            {error.message} <button className="block mt-1.5 font-semibold text-accent" onClick={manual}>Enter this food manually instead</button>
          </Notice>
        )}

        {results && results.length === 0 && !error && <p className="text-center text-muted py-4">No products found. <button className="text-accent font-semibold" onClick={manual}>Add it manually</button>.</p>}
        {results && results.map(p => (
          <button key={p.code + p.name} type="button" onClick={() => use(p)} className="w-full flex items-center gap-3 py-3 text-left border-b border-line/60 active:opacity-60">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-[13px] text-muted truncate">{p.brand ? `${p.brand} · ` : ''}{fmtNum(p.caloriesPer100g, 0)} kcal · {fmtNum(p.carbsPer100g, 1)} C · {fmtNum(p.fatPer100g, 1)} F /100 g</div>
            </div>
            <div className="text-right"><div className="text-[18px] font-bold text-protein tabular">{fmtNum(p.proteinPer100g, 1)}g</div><div className="text-[10px] uppercase text-muted">protein</div></div>
            <Icon name="chevR" size={16} className="text-muted" />
          </button>
        ))}
        <Button block variant="ghost" onClick={manual}>Add a food manually</Button>
      </div>
    </Sheet>
  );
}
