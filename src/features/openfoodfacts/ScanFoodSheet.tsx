import { useCallback, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Notice, TextInput } from '../../components/ui/misc';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { lookupBarcode } from '../../lib/openFoodFacts';
import { foodFromOffProduct } from '../../lib/openFoodFactsPack';
import { resolveBarcode } from '../../lib/pantry';
import type { Food } from '../../types';
import { newId } from '../../utils/id';
import { BarcodeScanner } from './BarcodeScanner';

/** The small "scan a barcode" button that sits at the end of every food search field. */
export function ScanButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" aria-label="Scan a barcode" onClick={onClick} className={`glass-btn h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-ink active:opacity-60 ${className}`}>
      <Icon name="scan" size={20} />
    </button>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the food behind the barcode (one you already have, or one just created from Open Food Facts). */
  onFood: (food: Food) => void;
  title?: string;
  /** Keep scanning after each product (for adding several ingredients). */
  continuous?: boolean;
}

/** Scan a product barcode and get a food: from your own foods first, otherwise from Open Food Facts (online). */
export function ScanFoodSheet(props: Props) {
  if (!props.open) return null;
  return <Inner {...props} />;
}

function Inner({ onClose, onFood, title = 'Scan a barcode', continuous = false }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [manual, setManual] = useState('');
  const [round, setRound] = useState(0);
  const cb = useRef({ onFood, onClose });
  cb.current = { onFood, onClose };

  const handle = useCallback(async (raw: string) => {
    const code = raw.replace(/\D/g, '');
    const s = useAppStore.getState();
    setBusy(true); setError(null);
    try {
      const out = await resolveBarcode(code, {
        pantry: [], foods: s.customFoods, lookup: lookupBarcode,
        lookupEnabled: s.settings.onlineLookupEnabled, online: typeof navigator === 'undefined' || navigator.onLine !== false,
      });
      let food: Food | null = null;
      if (out.kind === 'known') food = out.food;
      else if (out.kind === 'identified') { food = foodFromOffProduct(out.product, newId('food')); await s.saveFood(food); }
      else if (out.kind === 'unidentified') { setError({ message: out.message, code }); return; }
      if (food) {
        cb.current.onFood(food);
        if (continuous) setAdded(a => [food.name, ...a]); else cb.current.onClose();
      }
    } catch (e) {
      console.error(e);
      setError({ message: 'Something went wrong with the lookup.', code });
    } finally { setBusy(false); }
  }, [continuous]);

  const createManually = () => {
    const code = error?.code;
    onClose();
    useUI.setState({ foodForm: { prefill: code ? { barcode: code } : undefined } });
  };

  return (
    <Sheet open onClose={onClose} tall zIndex={78} title={title}
      footer={continuous ? <Button variant="primary" size="lg" block onClick={onClose}>{added.length ? `Done · ${added.length} added` : 'Done'}</Button> : undefined}>
      <div className="space-y-3 pt-1">
        <BarcodeScanner key={round} continuous={continuous} wide onDetect={handle} hint={continuous ? 'Hold each barcode in view — keep going.' : 'Point the camera at the barcode.'} />
        {busy && <p className="text-center text-[15px] text-muted" role="status">Looking it up…</p>}
        {error && (
          <Notice tone="warn">
            <div>{error.message}</div>
            <div className="flex gap-4 mt-2">
              <button type="button" className="font-semibold text-accent" onClick={() => { setError(null); setRound(r => r + 1); }}>Scan again</button>
              <button type="button" className="font-semibold text-accent" onClick={createManually}>Create it manually</button>
            </div>
          </Notice>
        )}
        <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (manual.length >= 6) { void handle(manual); setManual(''); } }}>
          <TextInput value={manual} onChange={e => setManual(e.target.value.replace(/\D/g, ''))} inputMode="numeric" placeholder="or type the barcode number" className="flex-1" aria-label="Barcode number" />
          <Button variant="secondary" type="submit" disabled={busy || manual.length < 6}>Add</Button>
        </form>
        {added.length > 0 && (
          <div>
            <div className="text-[13px] uppercase tracking-wider font-semibold text-muted px-1 pb-1">Added</div>
            {added.map((n, i) => <div key={`${n}-${i}`} className="flex items-center gap-2 py-2 border-b border-line/60 text-[15px]"><Icon name="check" size={18} className="text-ok" /><span className="truncate">{n}</span></div>)}
          </div>
        )}
        <p className="text-[12px] text-muted px-1">Products are looked up on Open Food Facts (needs internet). Foods you already have with that barcode are found offline.</p>
      </div>
    </Sheet>
  );
}
