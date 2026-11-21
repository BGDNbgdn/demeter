import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { Chip } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { currencyOf, fmtMoney, isLivePrice, pricePerKg, proteinValue } from '../../lib/cost';
import { fmtNum } from '../../lib/engine';

const PACKS = [125, 250, 400, 500, 750, 1000, 1500, 2000];
const packLabel = (g: number) => (g >= 1000 ? `${g / 1000} kg` : `${g} g`);

/** "This pack cost X and holds Y grams" → price per kg and the cost of 20 g of protein. */
export function PriceSheet() {
  const foodId = useUI(s => s.priceFoodId);
  if (!foodId) return null;
  return <Inner key={foodId} foodId={foodId} />;
}

function Inner({ foodId }: { foodId: string }) {
  const close = () => useUI.setState({ priceFoodId: null });
  const food = useAppStore(s => s.foodMap.get(foodId));
  const existing = useAppStore(s => s.prices[foodId]);
  const packFromFridge = useAppStore(s => s.pantry.find(i => i.foodId === foodId && i.packG)?.packG);
  const currency = useAppStore(s => currencyOf(s.settings));
  const { savePrice, deletePrice, showToast } = useAppStore.getState();
  const live = isLivePrice(existing) ? existing : undefined;
  const [price, setPrice] = useState<number | null>(live?.packPrice ?? null);
  const [pack, setPack] = useState<number | null>(live?.packG ?? packFromFridge ?? null);
  if (!food) return null;

  const valid = price != null && price >= 0 && pack != null && pack > 0;
  const perKg = valid ? pricePerKg({ packPrice: price, packG: pack }) : null;
  const value = valid ? proteinValue(food, { packPrice: price, packG: pack }) : null;

  const save = async () => {
    if (!valid) return;
    await savePrice(foodId, Math.round(price * 100) / 100, pack);
    showToast(`Saved price for ${food.name}`, { tone: 'success' });
    close();
  };

  return (
    <Sheet
      open onClose={close} zIndex={78}
      title={<span className="block leading-tight">Price<span className="block text-[14px] font-medium text-muted line-clamp-2">{food.name}</span></span>}
      footer={
        <div className="flex gap-2">
          {live && <Button variant="danger" size="lg" onClick={async () => { await deletePrice(foodId); showToast('Price removed'); close(); }}>Remove</Button>}
          <Button variant="primary" size="lg" block disabled={!valid} onClick={() => void save()}>Save price</Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Pack price (${currency})`}><NumInput value={price} onChange={setPrice} placeholder="0.00" autoFocus aria-label="Pack price" /></Field>
          <Field label="Pack size"><NumInput value={pack} onChange={setPack} suffix="g" placeholder="500" aria-label="Pack size in grams" /></Field>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5 pb-0.5">
          {PACKS.map(g => <Chip key={g} active={pack === g} onClick={() => setPack(g)}>{packLabel(g)}</Chip>)}
        </div>
        <p className="text-[12px] text-muted px-1 -mt-1">Liquids: 1 ml counts as 1 g. For loose items (like meat by the kg), enter the price for 1000 g.</p>

        <div className="rounded-2xl bg-surface2 p-4 space-y-1.5 tabular" aria-live="polite">
          {perKg != null ? (
            <>
              <div className="flex justify-between"><span className="text-muted">Per kg</span><b className="text-[18px]">{fmtMoney(perKg, currency)}</b></div>
              {value ? (
                <>
                  <div className="flex justify-between"><span className="text-muted">20 g of protein costs</span><b className="text-[18px] text-protein">{fmtMoney(value.per20g, currency)}</b></div>
                  <div className="flex justify-between"><span className="text-muted">Protein per {currency}1</span><b>{fmtNum(value.gramsPerCurrency, 1)} g</b></div>
                </>
              ) : <div className="text-[13px] text-muted">This food has almost no protein, so there’s no protein-per-{currency} figure.</div>}
            </>
          ) : <div className="text-[14px] text-muted">Enter the pack price and size to see what it costs per kg and per 20 g of protein.</div>}
        </div>
        {food.nutritionBasis === 'cooked' && <p className="text-[12px] text-muted px-1">This food’s nutrition is for the cooked product, so the protein figures assume you bought it cooked.</p>}
      </div>
    </Sheet>
  );
}
