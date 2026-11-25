import { useDeferredValue, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, EmptyState, Notice, SectionTitle, Segmented } from '../../components/ui/misc';
import { SwipeRow } from '../../components/ui/SwipeRow';
import { Chip } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { currencyOf, fmtMoney, isLivePrice, pricePerKg } from '../../lib/cost';
import { fmtNum } from '../../lib/engine';
import { chipName } from '../../lib/foodNames';
import { CATEGORY_ORDER, ageInDays, boughtLabel, byOldest, pantryItemForFood } from '../../lib/kitchen';
import { todayStr } from '../../utils/dates';
import type { Food, FoodCategory, PantryItem } from '../../types';
import { categoryLabel } from '../foods/FoodFormSheet';
import { KitchenShell } from './KitchenShell';
import { cn } from '../../utils/cn';

const QUICK_LIMIT = 18;
const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** My fridge: what you have right now. Scan groceries after shopping, or flip foods on and off in one tap. */
export function FridgePage() {
  const pantry = useAppStore(s => s.pantry);
  const gone = useAppStore(s => s.trash.pantry);
  const foodMap = useAppStore(s => s.foodMap);
  const searcher = useAppStore(s => s.searcher);
  const usage = useAppStore(s => s.usage);
  const favIds = useAppStore(s => s.settings.favoriteFoodIds);
  const prices = useAppStore(s => s.prices);
  const currency = useAppStore(s => currencyOf(s.settings));
  const addFood = useAppStore(s => s.addFoodToFridge);
  const removeItem = useAppStore(s => s.removePantryItem);
  const restoreItem = useAppStore(s => s.restorePantryItem);
  const showToast = useAppStore(s => s.showToast);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'type' | 'oldest'>('type');
  const dq = useDeferredValue(q);
  const today = todayStr();

  const results = useMemo(() => (dq.trim().length >= 2 ? searcher.search(dq, undefined, 'relevance', 12) : []), [searcher, dq]);

  /** Foods offered as one-tap toggles: what you eat most, favourites, and what recently ran out. */
  const quick = useMemo(() => {
    const ids: string[] = [];
    const push = (id?: string) => { if (id && foodMap.has(id) && !ids.includes(id)) ids.push(id); };
    Object.values(usage).filter(u => !u.key.startsWith('recipe:')).sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt).forEach(u => push(u.key));
    favIds.forEach(push);
    [...gone].sort((a, b) => b.updatedAt - a.updatedAt).forEach(g => push(g.foodId));
    return ids.slice(0, QUICK_LIMIT).map(id => foodMap.get(id) as Food);
  }, [usage, favIds, gone, foodMap]);

  const toggle = async (food: Food) => {
    const have = pantryItemForFood(pantry, food.id);
    if (have) {
      await removeItem(have.id);
      showToast(`${short(food.name)} is out of the fridge`, { actionLabel: 'Undo', onAction: () => { void restoreItem(have.id); } });
    } else {
      await addFood(food);
    }
  };

  const { unidentified, groups } = useMemo(() => {
    const unidentified = pantry.filter(i => !i.foodId);
    const by = new Map<FoodCategory, PantryItem[]>();
    for (const i of pantry) {
      if (!i.foodId) continue;
      const cat = foodMap.get(i.foodId)?.category ?? 'other';
      by.set(cat, [...(by.get(cat) ?? []), i]);
    }
    const groups = CATEGORY_ORDER.filter(c => by.has(c)).map(c => ({ cat: c, items: (by.get(c) as PantryItem[]).sort((a, b) => a.name.localeCompare(b.name)) }));
    return { unidentified, groups };
  }, [pantry, foodMap]);
  const oldestFirst = useMemo(() => pantry.filter(i => i.foodId).sort(byOldest), [pantry]);
  const oldest = useMemo(() => [...pantry].sort(byOldest)[0], [pantry]);

  const ranOut = async (item: PantryItem) => {
    await removeItem(item.id);
    showToast(`${short(item.name)} — ran out`, { actionLabel: 'Undo', onAction: () => { void restoreItem(item.id); } });
  };

  const row = (item: PantryItem) => {
    const food = item.foodId ? foodMap.get(item.foodId) : undefined;
    const p = item.foodId ? prices[item.foodId] : undefined;
    const age = ageInDays(item, today);
    const sub = [
      item.brand,
      item.amountG != null ? `${fmtNum(item.amountG, 0)} g left` : null,
      isLivePrice(p) ? `${fmtMoney(pricePerKg(p), currency)}/kg` : null,
    ].filter(Boolean).join(' · ');
    return (
      <SwipeRow key={item.id} radius="" actionLabel="Ran out" icon="x" className="border-b border-line/60 last:border-b-0" onAction={() => void ranOut(item)}>
        <div className="flex items-center">
          <button type="button" className="flex-1 min-w-0 text-left py-3 pl-1 pr-2 active:opacity-60" onClick={() => useUI.setState({ pantryItemId: item.id })}>
            <div className="text-[16px] font-medium leading-snug line-clamp-2">{item.name}</div>
            {sub && <div className="text-[13px] text-muted truncate tabular">{sub}</div>}
            <div className={cn('text-[12px] tabular', age >= 7 ? 'text-warn font-medium' : 'text-muted')} data-testid="bought-label">{boughtLabel(item, today)}</div>
            {!item.foodId && <div className="text-[12px] text-warn font-medium">Tap to name it</div>}
          </button>
          {food && (
            <div className="text-right shrink-0 pr-1" aria-hidden>
              <div className="text-[17px] font-bold text-protein tabular leading-none">{fmtNum(food.proteinPer100g, 1)}<span className="text-[11px] font-semibold ml-0.5">g</span></div>
              <div className="text-[10px] uppercase tracking-wider text-muted mt-0.5">protein</div>
            </div>
          )}
          <button
            type="button" aria-label={`${item.name}: ran out`}
            className="h-11 w-11 shrink-0 flex items-center justify-center rounded-full text-muted/70 active:bg-surface2 active:text-danger"
            onClick={() => void ranOut(item)}
          >
            <Icon name="x" size={20} />
          </button>
        </div>
      </SwipeRow>
    );
  };

  return (
    <KitchenShell title="Kitchen" subtitle={pantry.length ? `${pantry.length} item${pantry.length === 1 ? '' : 's'} in my fridge` : 'My fridge'}>
      <div className="space-y-3 pt-2">
        <Button variant="primary" size="lg" block icon="scan" onClick={() => useUI.setState({ scanOpen: true })}>Scan groceries</Button>

        <label className="glass flex items-center gap-2.5 h-[54px] rounded-full px-[18px] text-muted">
          <Icon name="search" size={20} />
          <input
            value={q} onChange={e => setQ(e.target.value)} type="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="Add or remove a food by name…" aria-label="Find a food"
            className="flex-1 min-w-0 h-11 bg-transparent outline-none text-[16px] text-ink"
          />
        </label>
      </div>

      {dq.trim().length >= 2 ? (
        <Card className="!p-2 mt-3">
          {results.length === 0 && <p className="text-center text-muted py-5">No match. Try another word.</p>}
          {results.map(f => {
            const have = !!pantryItemForFood(pantry, f.id);
            return (
              <button key={f.id} type="button" onClick={() => void toggle(f)} aria-pressed={have}
                className="w-full flex items-center gap-3 py-2.5 px-2 text-left border-b border-line/60 last:border-b-0 active:opacity-60">
                <span className={cn('h-8 w-8 rounded-full flex items-center justify-center shrink-0', have ? 'pill-on' : 'bg-surface2 text-muted')}>
                  <Icon name={have ? 'check' : 'plus'} size={18} strokeWidth={2.4} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[16px] font-medium leading-snug line-clamp-2">{f.name}</span>
                  <span className="block text-[12px] text-muted">{have ? 'In my fridge — tap to remove' : 'Tap to add'}{f.brand ? ` · ${f.brand}` : ''}</span>
                </span>
                <span className="text-[16px] font-bold text-protein tabular shrink-0">{fmtNum(f.proteinPer100g, 1)}<span className="text-[11px]">g</span></span>
              </button>
            );
          })}
        </Card>
      ) : (
        <>
          {unidentified.length > 0 && (
            <>
              <SectionTitle>Needs a name</SectionTitle>
              <Notice tone="warn" className="mb-2"><span className="text-[13px]">These barcodes weren’t recognised (offline, or not in the database). Tap one to name it or pick the matching food.</span></Notice>
              <Card className="!p-2">{unidentified.map(row)}</Card>
            </>
          )}

          {pantry.length > 1 && (
            <div className="mt-3 space-y-2">
              <Segmented value={sort} onChange={setSort} options={[{ value: 'type', label: 'By type' }, { value: 'oldest', label: 'Oldest first' }]} />
              {oldest && ageInDays(oldest, today) >= 3 && <p className="text-[13px] text-muted px-1" data-testid="oldest-hint">Oldest: <b className="text-ink">{short(oldest.name, 34)}</b> — {boughtLabel(oldest, today).toLowerCase()}.</p>}
            </div>
          )}

          {pantry.length === 0 ? (
            <EmptyState
              icon="fridge" title="Your fridge is empty"
              body="After shopping, tap Scan groceries and beep each barcode — or tap foods below to mark what you have."
            />
          ) : sort === 'oldest' ? (
            <Card className="!p-2 mt-3">{oldestFirst.map(row)}</Card>
          ) : (
            groups.map(g => (
              <div key={g.cat}>
                <SectionTitle right={<span className="text-[12px] text-muted">{g.items.length}</span>}>{categoryLabel(g.cat)}</SectionTitle>
                <Card className="!p-2">{g.items.map(row)}</Card>
              </div>
            ))
          )}

          {quick.length > 0 && (
            <>
              <SectionTitle>Quick toggle</SectionTitle>
              <p className="text-[13px] text-muted px-1 -mt-1 mb-2.5">Your usual foods. Tap to say you have it — tap again when it’s gone.</p>
              <div className="flex flex-wrap gap-2">
                {quick.map(f => {
                  const have = !!pantryItemForFood(pantry, f.id);
                  return (
                    <Chip key={f.id} active={have} onClick={() => void toggle(f)} aria-pressed={have} className="inline-flex items-center gap-1.5">
                      {have && <Icon name="check" size={15} strokeWidth={2.6} />}{chipName(f.name)}
                    </Chip>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}
    </KitchenShell>
  );
}
