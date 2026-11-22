import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, EmptyState, Notice, SectionTitle } from '../../components/ui/misc';
import { useAppStore } from '../../hooks/useAppStore';
import { currencyOf, fmtMoney } from '../../lib/cost';
import { buildShoppingList, fmtWeight, shoppingText, type PlanLookups, type ShopRow } from '../../lib/kitchen';
import { formatShort, addDays } from '../../utils/dates';
import { newId } from '../../utils/id';
import { categoryLabel } from '../foods/FoodFormSheet';
import { KitchenShell } from './KitchenShell';
import { WeekNav } from './WeekNav';
import { useWeek } from './useWeek';

/** Shopping list = what the week's plan needs, minus what is already in the fridge. Tick an item to put it in the fridge. */
export function ShopPage() {
  const week = useWeek(s => s.week);
  const plan = useAppStore(s => s.plan);
  const recipes = useAppStore(s => s.recipes);
  const foodMap = useAppStore(s => s.foodMap);
  const prices = useAppStore(s => s.prices);
  const pantry = useAppStore(s => s.pantry);
  const currency = useAppStore(s => currencyOf(s.settings));
  const { addFoodToFridge, savePantryItem, removePantryItem, restorePantryItem, showToast } = useAppStore.getState();
  const navigate = useNavigate();
  const [showHave, setShowHave] = useState(false);

  const lines = useMemo(() => plan.filter(l => l.week === week), [plan, week]);
  const look: PlanLookups = useMemo(() => {
    const rm = new Map(recipes.map(r => [r.id, r]));
    return { recipeOf: id => rm.get(id), foodOf: id => foodMap.get(id), priceOf: id => prices[id] };
  }, [recipes, foodMap, prices]);
  const list = useMemo(() => buildShoppingList(lines, pantry, look), [lines, pantry, look]);
  const title = `Shopping list ${formatShort(week)} – ${formatShort(addDays(week, 6))}`;

  /** Got it → it goes into the fridge (and the list updates by itself). */
  const got = async (row: ShopRow) => {
    let id: string; let wasNew = true;
    const food = row.foodId ? foodMap.get(row.foodId) : undefined;
    if (food) {
      const r = await addFoodToFridge(food, row.packG ? { packG: row.packG } : {});
      id = r.item.id; wasNew = !r.existed;
    } else {
      const now = Date.now();
      id = newId('pan');
      await savePantryItem({ id, name: row.name, createdAt: now, updatedAt: now });
    }
    showToast(`${row.name} → in the fridge`, { tone: 'success', actionLabel: wasNew ? 'Undo' : undefined, onAction: wasNew ? () => { void removePantryItem(id); } : undefined });
  };
  const putBack = async (row: ShopRow) => {
    const items = pantry.filter(i => (row.foodId ? i.foodId === row.foodId : !i.foodId && i.name.toLowerCase() === row.name.toLowerCase()));
    for (const i of items) { await removePantryItem(i.id); }
    if (items.length) showToast(`${row.name} — not in the fridge`, { actionLabel: 'Undo', onAction: () => { items.forEach(i => void restorePantryItem(i.id)); } });
  };

  const share = async () => {
    const text = shoppingText(list, title, fmtWeight);
    try {
      if (navigator.share) { await navigator.share({ title, text }); return; }
      await navigator.clipboard.writeText(text);
      showToast('List copied', { tone: 'success' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') showToast('Could not share the list', { tone: 'error' });
    }
  };

  const rowView = (r: ShopRow, covered: boolean) => (
    <div key={r.key} className="flex items-center gap-3 py-2.5 border-b border-line/60 last:border-b-0">
      <button type="button" aria-label={covered ? `${r.name}: take out of the fridge` : `Got ${r.name}`} aria-pressed={covered}
        onClick={() => void (covered ? putBack(r) : got(r))}
        className={`h-9 w-9 shrink-0 rounded-full border-2 flex items-center justify-center active:scale-95 transition-transform ${covered ? 'bg-grad border-transparent' : 'border-muted/50 text-transparent'}`}>
        <Icon name="check" size={18} strokeWidth={3} />
      </button>
      <div className="flex-1 min-w-0">
        <div className={`text-[16px] font-medium leading-snug line-clamp-2 ${covered ? 'text-muted' : ''}`}>{r.name}</div>
        <div className="text-[12px] text-muted truncate">
          {covered ? (r.haveUnknown ? 'In the fridge' : `Fridge has ${fmtWeight(r.haveG)} · need ${fmtWeight(r.needG)}`) : (r.haveG > 0 ? `Need ${fmtWeight(r.needG)} · have ${fmtWeight(r.haveG)}` : `For ${r.from.join(', ')}`)}
        </div>
      </div>
      {!covered && (
        <div className="text-right shrink-0 tabular">
          <div className="text-[16px] font-bold">{fmtWeight(r.buyG)}</div>
          <div className="text-[11px] text-muted">{r.packs && r.packG ? `${r.packs} × ${fmtWeight(r.packG)}` : ''}{r.cost != null ? `${r.packs && r.packG ? ' · ' : ''}${fmtMoney(r.cost, currency)}` : ''}</div>
        </div>
      )}
    </div>
  );

  // group "to buy" by category
  const groups = useMemo(() => {
    const out: Array<{ cat: string; rows: ShopRow[] }> = [];
    for (const r of list.buy) {
      const last = out[out.length - 1];
      if (last && last.cat === r.category) last.rows.push(r); else out.push({ cat: r.category, rows: [r] });
    }
    return out;
  }, [list.buy]);

  return (
    <KitchenShell title="Kitchen" subtitle="Shopping list">
      <div className="space-y-3 pt-3">
        <WeekNav />

        {lines.length === 0 ? (
          <EmptyState icon="cart" title="No plan for this week" body="Plan some recipes first — the shopping list is built from them."
            action={<Button variant="primary" onClick={() => navigate('/plan')}>Plan the week</Button>} />
        ) : (
          <>
            <Card className="!p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-[13px] uppercase tracking-wider font-semibold text-muted">To buy</div>
                <div className="text-[26px] font-bold tabular leading-tight">{list.buy.length} <span className="text-[14px] text-muted font-medium">item{list.buy.length === 1 ? '' : 's'}</span></div>
                {list.estCost > 0 && <div className="text-[13px] text-muted tabular">≈ {fmtMoney(list.estCost, currency)}{list.unpriced > 0 ? ` + ${list.unpriced} without a price` : ''}</div>}
              </div>
              <Button icon="upload" onClick={() => void share()} disabled={list.buy.length === 0}>Share</Button>
            </Card>

            {list.skipped.length > 0 && <Notice tone="warn"><span className="text-[13px]">Left out because they were deleted: <b>{list.skipped.join(', ')}</b>.</span></Notice>}

            {list.buy.length === 0 ? (
              <EmptyState icon="check" title="Nothing to buy" body="Everything this week’s plan needs is already in your fridge." />
            ) : (
              groups.map(g => (
                <div key={g.cat}>
                  <SectionTitle>{categoryLabel(g.cat as never)}</SectionTitle>
                  <Card className="!p-2.5">{g.rows.map(r => rowView(r, false))}</Card>
                </div>
              ))
            )}

            {list.have.length > 0 && (
              <div>
                <button type="button" className="w-full flex items-center justify-between px-1 pt-4 pb-2 text-[13px] uppercase tracking-wider font-semibold text-muted" onClick={() => setShowHave(v => !v)} aria-expanded={showHave}>
                  <span>Already in your fridge ({list.have.length})</span>
                  <Icon name={showHave ? 'chevD' : 'chevR'} size={16} />
                </button>
                {showHave && <Card className="!p-2.5">{list.have.map(r => rowView(r, true))}</Card>}
              </div>
            )}
            <p className="text-[12px] text-muted px-1">Amounts are raw weights from your recipes’ ingredients. Tap the circle when you’ve got something — it moves into your fridge.</p>
          </>
        )}
      </div>
    </KitchenShell>
  );
}
