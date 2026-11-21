import { useCallback, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Notice, TextInput } from '../../components/ui/misc';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { currencyOf, fmtMoney, isLivePrice } from '../../lib/cost';
import { lookupBarcode } from '../../lib/openFoodFacts';
import { foodFromOffProduct } from '../../lib/openFoodFactsPack';
import { resolveBarcode } from '../../lib/pantry';
import { newId } from '../../utils/id';
import { cn } from '../../utils/cn';
import { BarcodeScanner } from '../openfoodfacts/BarcodeScanner';

interface ScanRow {
  key: number;
  status: 'added' | 'already' | 'unidentified';
  code: string;
  name: string;
  itemId: string;
  foodId?: string;
  note?: string;
}

/** Scan groceries one after another; each barcode goes straight into My fridge. */
export function ScanSheet() {
  const open = useUI(s => s.scanOpen);
  if (!open) return null;
  return <Inner />;
}

function Inner() {
  const close = () => useUI.setState({ scanOpen: false });
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState('');
  const seq = useRef(0);
  const prices = useAppStore(s => s.prices);
  const currency = useAppStore(s => currencyOf(s.settings));
  const removePantryItem = useAppStore(s => s.removePantryItem);

  const handle = useCallback(async (raw: string) => {
    const code = raw.replace(/\D/g, '');
    const s = useAppStore.getState();
    const push = (r: Omit<ScanRow, 'key'>) => setRows(prev => [{ key: ++seq.current, ...r }, ...prev]);
    setBusy(true);
    try {
      const out = await resolveBarcode(code, {
        pantry: s.pantry, foods: s.customFoods, lookup: lookupBarcode,
        lookupEnabled: s.settings.onlineLookupEnabled, online: typeof navigator === 'undefined' || navigator.onLine !== false,
      });
      if (out.kind === 'already') {
        push({ status: 'already', code, name: out.item.name, itemId: out.item.id, foodId: out.item.foodId });
      } else if (out.kind === 'known') {
        const { item, existed } = await s.addFoodToFridge(out.food);
        push({ status: existed ? 'already' : 'added', code, name: item.name, itemId: item.id, foodId: item.foodId });
      } else if (out.kind === 'identified') {
        const food = foodFromOffProduct(out.product, newId('food'));
        await s.saveFood(food);
        const { item } = await s.addFoodToFridge(food, out.product.packG ? { packG: out.product.packG } : {});
        push({ status: 'added', code, name: item.name, itemId: item.id, foodId: food.id });
      } else if (out.reason === 'invalid') {
        s.showToast(out.message, { tone: 'error' });
        return;
      } else {
        const item = await s.addUnidentifiedToFridge(code);
        push({ status: 'unidentified', code, name: item.name, itemId: item.id, note: out.message });
      }
      try { navigator.vibrate?.(25); } catch { /* not supported on iPhone */ }
    } catch (e) {
      console.error(e);
      s.showToast('Could not add that item.', { tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, []);

  const added = rows.filter(r => r.status !== 'already').length;
  const latest = rows[0];

  return (
    <Sheet
      open onClose={close} tall zIndex={72} title="Scan groceries"
      footer={<Button variant="primary" size="lg" block onClick={close}>{added > 0 ? `Done · ${added} added` : 'Done'}</Button>}
    >
      <div className="space-y-3 pt-1">
        <BarcodeScanner continuous wide onDetect={handle} hint="Hold each barcode in view — it’s added automatically. Keep going." />

        <div
          className={cn('rounded-2xl px-4 py-3 min-h-[60px] flex items-center gap-3 transition-colors', busy ? 'bg-surface2 text-muted' : latest?.status === 'added' ? 'bg-ok/15' : latest?.status === 'unidentified' ? 'bg-warn/15' : 'bg-surface2')}
          style={latest && !busy ? { background: `color-mix(in srgb, ${latest.status === 'added' ? 'var(--ok)' : latest.status === 'unidentified' ? 'var(--warn)' : 'var(--muted)'} 14%, transparent)` } : undefined}
          role="status" aria-live="polite" data-testid="scan-status"
        >
          {busy ? <span className="text-[15px]">Looking it up…</span> : latest ? (
            <>
              <Icon name={latest.status === 'unidentified' ? 'alert' : 'check'} size={22} className={latest.status === 'unidentified' ? 'text-warn' : 'text-ok'} />
              <div className="min-w-0">
                <div className="text-[16px] font-semibold truncate">{latest.status === 'already' ? 'Already in your fridge' : latest.status === 'added' ? 'Added' : 'Saved — name it later'}</div>
                <div className="text-[13px] text-muted truncate">{latest.name}</div>
              </div>
            </>
          ) : <span className="text-[15px] text-muted">Nothing scanned yet.</span>}
        </div>

        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (manual.length >= 6) { void handle(manual); setManual(''); } }}>
          <TextInput value={manual} onChange={e => setManual(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="or type a barcode number" className="flex-1" aria-label="Barcode number" />
          <Button variant="secondary" type="submit" disabled={busy || manual.length < 6}>Add</Button>
        </form>

        {rows.length > 0 && (
          <div className="pt-1">
            <div className="text-[13px] uppercase tracking-wider font-semibold text-muted px-1 pb-1">This trip</div>
            {rows.map(r => {
              const p = r.foodId ? prices[r.foodId] : undefined;
              return (
                <div key={r.key} className="flex items-center gap-2 py-2 border-b border-line/60">
                  <Icon name={r.status === 'unidentified' ? 'alert' : r.status === 'already' ? 'info' : 'check'} size={18} className={r.status === 'unidentified' ? 'text-warn' : r.status === 'already' ? 'text-muted' : 'text-ok'} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium truncate">{r.name}</div>
                    <div className="text-[12px] text-muted truncate">{r.status === 'already' ? 'Already in the fridge' : r.status === 'unidentified' ? (r.note ?? 'Not identified') : r.code}</div>
                  </div>
                  {r.foodId && (
                    <button type="button" aria-label={`Set price for ${r.name}`} className="h-9 px-2.5 rounded-xl bg-surface2 text-[13px] font-medium flex items-center gap-1 active:bg-surface3"
                      onClick={() => useUI.setState({ priceFoodId: r.foodId as string })}>
                      <Icon name="tag" size={15} />{isLivePrice(p) ? fmtMoney(p.packPrice, currency) : 'Price'}
                    </button>
                  )}
                  {r.status !== 'already' && (
                    <button type="button" aria-label={`Remove ${r.name} from the fridge`} className="h-9 w-9 flex items-center justify-center rounded-full text-muted active:bg-surface2"
                      onClick={async () => { await removePantryItem(r.itemId); setRows(prev => prev.filter(x => x.key !== r.key)); }}>
                      <Icon name="x" size={18} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <Notice tone="info"><span className="text-[13px]">Products are looked up on Open Food Facts (needs internet). Offline? The barcode is still saved — name it later from the fridge.</span></Notice>
      </div>
    </Sheet>
  );
}
