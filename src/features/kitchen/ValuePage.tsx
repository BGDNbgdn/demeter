import { useMemo, useState } from 'react';
import { IconButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, EmptyState, Notice, SectionTitle, Segmented } from '../../components/ui/misc';
import { Chip } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { currencyOf, fmtMoney, isLivePrice, rankByValue } from '../../lib/cost';
import { fmtNum } from '../../lib/engine';
import { chipName } from '../../lib/foodNames';
import { cn } from '../../utils/cn';
import { IngredientPicker } from '../recipes/IngredientPicker';
import { KitchenShell } from './KitchenShell';

/** Protein per euro: your priced foods, cheapest 20 g of protein first. */
export function ValuePage() {
  const prices = useAppStore(s => s.prices);
  const foodMap = useAppStore(s => s.foodMap);
  const pantry = useAppStore(s => s.pantry);
  const currency = useAppStore(s => currencyOf(s.settings));
  const [scope, setScope] = useState<'all' | 'fridge'>('all');
  const [picking, setPicking] = useState(false);

  const fridgeIds = useMemo(() => new Set(pantry.map(i => i.foodId).filter((x): x is string => !!x)), [pantry]);
  const ranked = useMemo(() => rankByValue(Object.values(prices), id => foodMap.get(id)), [prices, foodMap]);
  const rows = scope === 'fridge' ? ranked.filter(r => fridgeIds.has(r.food.id)) : ranked;
  const best = rows[0]?.value.per20g;
  const unpriced = useMemo(() => [...fridgeIds].filter(id => !isLivePrice(prices[id]) && foodMap.has(id)), [fridgeIds, prices, foodMap]);
  const noProteinPriced = Object.values(prices).filter(isLivePrice).length - ranked.length;

  return (
    <KitchenShell title="Kitchen" subtitle="Protein value" right={<IconButton icon="plus" label="Add a price" className="bg-accentsoft text-accent mr-1" onClick={() => setPicking(true)} />}>
      <div className="space-y-3 pt-3">
        <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'All priced foods' }, { value: 'fridge', label: 'In my fridge' }]} />

        {unpriced.length > 0 && (
          <Card className="!p-3.5">
            <div className="text-[14px] font-semibold flex items-center gap-2"><Icon name="tag" size={16} className="text-accent" />Missing a price</div>
            <p className="text-[12px] text-muted mt-0.5 mb-2">In your fridge, but no price yet. Tap one to add it.</p>
            <div className="flex flex-wrap gap-2">
              {unpriced.slice(0, 14).map(id => <Chip key={id} className="!h-9 !text-[14px]" onClick={() => useUI.setState({ priceFoodId: id })}>{chipName(foodMap.get(id)?.name ?? '')}</Chip>)}
            </div>
          </Card>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon="tag" title={scope === 'fridge' && ranked.length > 0 ? 'None of your fridge has a price' : 'No prices yet'}
            body="Add what things cost and Demeter ranks them by the price of 20 g of protein. When you scan groceries, tap “Price” on each item."
            action={<button type="button" className="text-accent font-semibold h-11" onClick={() => setPicking(true)}>Add a price</button>}
          />
        ) : (
          <>
            <SectionTitle>Cheapest protein first</SectionTitle>
            <Card className="!p-1.5 !pt-0.5">
              {rows.map((r, i) => (
                <button key={r.food.id} type="button" onClick={() => useUI.setState({ priceFoodId: r.food.id })}
                  className="w-full flex items-center gap-3 py-3 px-2 text-left border-b border-line/60 last:border-b-0 active:opacity-60">
                  <span className={cn('h-7 w-7 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 tabular', i === 0 ? 'bg-accent text-accentink' : 'bg-surface2 text-muted')}>{i + 1}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[16px] font-medium leading-snug line-clamp-2">{r.food.name}</span>
                    <span className="block text-[12px] text-muted tabular">
                      {fmtMoney(r.perKg, currency)}/kg · {fmtNum(r.food.proteinPer100g, 1)}% protein{fridgeIds.has(r.food.id) ? ' · in fridge' : ''}
                    </span>
                  </span>
                  <span className="text-right shrink-0 tabular">
                    <span className="block text-[18px] font-bold text-protein leading-tight">{fmtMoney(r.value.per20g, currency)}</span>
                    <span className="block text-[10px] uppercase tracking-wider text-muted">per 20 g protein</span>
                    {best != null && i > 0 && best > 0 && <span className="block text-[11px] text-muted">×{fmtNum(r.value.per20g / best, 1)}</span>}
                  </span>
                </button>
              ))}
            </Card>
            <p className="text-[12px] text-muted px-1">Prices are for the food as you buy it (raw or packaged). Cooking changes weight, not protein — so compare raw to raw.</p>
          </>
        )}
        {noProteinPriced > 0 && <Notice tone="info"><span className="text-[13px]">{noProteinPriced} priced food{noProteinPriced === 1 ? ' has' : 's have'} almost no protein, so {noProteinPriced === 1 ? 'it isn’t' : 'they aren’t'} ranked.</span></Notice>}
      </div>
      <IngredientPicker open={picking} onClose={() => setPicking(false)} title="Which food?" hint={false} allowCustom={false}
        onPick={f => { setPicking(false); useUI.setState({ priceFoodId: f.id }); }} />
    </KitchenShell>
  );
}
