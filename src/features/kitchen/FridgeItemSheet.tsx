import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Field, MacroLine, Notice, TextInput } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { currencyOf, fmtMoney, isLivePrice, pricePerKg } from '../../lib/cost';
import { foodPer100, fmtNum } from '../../lib/engine';
import { OffError, lookupBarcode } from '../../lib/openFoodFacts';
import { foodFromOffProduct } from '../../lib/openFoodFactsPack';
import type { Food, PantryItem } from '../../types';
import { newId } from '../../utils/id';
import { boughtDate, boughtLabel } from '../../lib/kitchen';
import { todayStr } from '../../utils/dates';
import { IngredientPicker } from '../recipes/IngredientPicker';

export function FridgeItemSheet() {
  const id = useUI(s => s.pantryItemId);
  const item = useAppStore(s => (id ? s.pantry.find(i => i.id === id) : undefined));
  if (!id || !item) return null;
  return <Inner key={item.id} item={item} />;
}

function Inner({ item }: { item: PantryItem }) {
  const close = () => useUI.setState({ pantryItemId: null });
  const food = useAppStore(s => (item.foodId ? s.foodMap.get(item.foodId) : undefined));
  const price = useAppStore(s => (item.foodId ? s.prices[item.foodId] : undefined));
  const currency = useAppStore(s => currencyOf(s.settings));
  const online = useAppStore(s => s.settings.onlineLookupEnabled);
  const { savePantryItem, removePantryItem, restorePantryItem, saveFood, showToast } = useAppStore.getState();
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState<number | null>(item.amountG ?? null);
  const [pack, setPack] = useState<number | null>(item.packG ?? null);
  const [bought, setBought] = useState(boughtDate(item));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patchFromAmounts = (): PantryItem => {
    const next: PantryItem = { ...item, name: item.foodId ? item.name : (name.trim() || item.name) };
    if (amount != null && amount >= 0) next.amountG = amount; else delete next.amountG;
    if (pack != null && pack > 0) next.packG = pack; else delete next.packG;
    if (/^\d{4}-\d{2}-\d{2}$/.test(bought)) next.boughtAt = bought;
    return next;
  };
  const save = async () => { await savePantryItem(patchFromAmounts()); close(); };

  const link = async (f: Food) => {
    // teach the app this barcode, so the next scan is recognised straight away
    if (item.barcode && f.source !== 'builtin' && !f.barcode) await saveFood({ ...f, barcode: item.barcode });
    await savePantryItem({ ...patchFromAmounts(), foodId: f.id, name: f.name, ...(f.brand ? { brand: f.brand } : {}) });
    setPicking(false);
    showToast(`Linked to ${f.name}`, { tone: 'success' });
  };

  const lookup = async () => {
    if (!item.barcode) return;
    setBusy(true); setError(null);
    try {
      const p = await lookupBarcode(item.barcode);
      const f = foodFromOffProduct(p, newId('food'));
      await saveFood(f);
      await savePantryItem({ ...patchFromAmounts(), foodId: f.id, name: f.name, ...(f.brand ? { brand: f.brand } : {}), ...(p.packG ? { packG: p.packG } : {}) });
      showToast(`Found: ${f.name}`, { tone: 'success' });
    } catch (e) {
      setError(e instanceof OffError ? e.message : 'The lookup failed.');
    } finally { setBusy(false); }
  };

  const ranOut = async () => {
    close();
    await removePantryItem(item.id);
    showToast(`${item.name} — ran out`, { actionLabel: 'Undo', onAction: () => { void restorePantryItem(item.id); } });
  };

  return (
    <>
      <Sheet
        open onClose={close} zIndex={60}
        title={<span className="block leading-tight">{item.name}{item.brand && <span className="block text-[13px] font-medium text-muted">{item.brand}</span>}</span>}
        footer={<div className="flex gap-2"><Button variant="danger" size="lg" className="whitespace-nowrap" onClick={() => void ranOut()}>Ran out</Button><Button variant="primary" size="lg" block onClick={() => void save()}>Save</Button></div>}
      >
        <div className="space-y-4 pt-1">
          {!item.foodId ? (
            <>
              <Notice tone="warn"><span className="text-[13px]">This product isn’t identified yet{item.barcode ? <> (barcode <b>{item.barcode}</b>)</> : ''}. Name it, look it up, or pick the matching food — then it counts towards your shopping list and nutrition.</span></Notice>
              <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Skyr vanilla" /></Field>
              <div className="flex flex-col gap-2">
                {item.barcode && online && <Button icon="globe" onClick={() => void lookup()} disabled={busy}>{busy ? 'Looking up…' : 'Look it up online'}</Button>}
                <Button icon="search" onClick={() => setPicking(true)}>Pick from my foods</Button>
              </div>
              {error && <Notice tone="error">{error}</Notice>}
            </>
          ) : food ? (
            <div className="rounded-2xl bg-surface2 p-3.5">
              <MacroLine m={foodPer100(food)} />
              <div className="text-[12px] text-muted mt-1">per 100 g{food.nutritionBasis === 'raw' ? ' (raw)' : food.nutritionBasis === 'cooked' ? ' (cooked)' : ''}</div>
            </div>
          ) : (
            <Notice tone="warn"><span className="text-[13px]">The food behind this item was deleted. You can still keep it in the fridge.</span></Notice>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Left (optional)" hint="Empty = “I have it”">
              <NumInput value={amount} onChange={setAmount} suffix="g" placeholder="–" aria-label="Grams left" />
            </Field>
            <Field label="Pack size" hint="One pack, in grams">
              <NumInput value={pack} onChange={setPack} suffix="g" placeholder="–" aria-label="Pack size in grams" />
            </Field>
          </div>

          <div>
            <div className="text-[13px] font-medium text-muted mb-1.5 px-1">Bought</div>
            <div className="flex items-center gap-2">
              <input
                type="date" value={bought} max={todayStr()} onChange={e => e.target.value && setBought(e.target.value)} aria-label="Date bought"
                className="flex-1 min-w-0 h-12 rounded-2xl bg-surface2 border border-line px-4 text-[17px] outline-none focus:border-accent"
              />
              {bought !== todayStr() && <button type="button" className="glass-btn h-12 px-4 rounded-full text-[15px] font-semibold" onClick={() => setBought(todayStr())}>Today</button>}
            </div>
            <p className="text-[12px] text-muted mt-1 px-1">{boughtLabel({ boughtAt: bought, createdAt: item.createdAt }, todayStr())}</p>
          </div>

          {item.foodId && (
            <button type="button" className="w-full flex items-center gap-3 rounded-2xl bg-surface2 px-4 h-14 text-left active:bg-surface3"
              onClick={() => useUI.setState({ priceFoodId: item.foodId as string })}>
              <Icon name="tag" size={20} className="text-muted" />
              <span className="flex-1 text-[16px]">
                {isLivePrice(price) ? <>{fmtMoney(price.packPrice, currency)} <span className="text-muted">for {fmtNum(price.packG, 0)} g · {fmtMoney(pricePerKg(price), currency)}/kg</span></> : 'Add a price'}
              </span>
              <Icon name="chevR" size={16} className="text-muted" />
            </button>
          )}

          {item.foodId && food && (
            <Button block icon="plus" onClick={() => { close(); useUI.setState({ logFood: { foodId: food.id, weightG: amount ?? undefined } }); }}>Log a portion of this</Button>
          )}
        </div>
      </Sheet>
      <IngredientPicker open={picking} onClose={() => setPicking(false)} onPick={f => void link(f)} title="Which food is this?" hint={false} />
    </>
  );
}
