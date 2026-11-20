import { useDeferredValue, useMemo, useState } from 'react';
import { FoodRow } from '../../components/FoodRow';
import { Button, IconButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { EmptyState, PageHeader } from '../../components/ui/misc';
import { Chip } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import type { FoodCategory } from '../../types';
import { FOOD_CATEGORIES, type Food } from '../../types';
import type { FoodSort } from '../../lib/search';
import { categoryLabel } from './FoodFormSheet';

type CatFilter = 'all' | 'favorites' | 'recent' | 'custom-only' | FoodCategory;
const QUICK: Array<{ id: 'high' | 'lean' | 'low'; label: string }> = [
  { id: 'high', label: 'High protein ≥ 20 g' },
  { id: 'lean', label: 'Lean ≥ 10 g / 100 kcal' },
  { id: 'low', label: 'Low-cal ≤ 100 kcal' },
];

export function FoodsPage() {
  const searcher = useAppStore(s => s.searcher);
  const usage = useAppStore(s => s.usage);
  const foodMap = useAppStore(s => s.foodMap);
  const favIds = useAppStore(s => s.settings.favoriteFoodIds);
  const toggleFav = useAppStore(s => s.toggleFavoriteFood);
  const customCount = useAppStore(s => s.customFoods.length);
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const [cat, setCat] = useState<CatFilter>('all');
  const [quick, setQuick] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<FoodSort>('relevance');
  const [limit, setLimit] = useState(60);
  const favSet = useMemo(() => new Set(favIds), [favIds]);

  const results: Food[] = useMemo(() => {
    const filters = {
      category: (cat === 'all' || cat === 'favorites' || cat === 'recent' || cat === 'custom-only' ? 'all' : cat) as FoodCategory | 'all',
      favoritesOnly: cat === 'favorites', favoriteIds: favSet,
      minProteinPer100g: quick.has('high') ? 20 : undefined,
      minProteinPer100kcal: quick.has('lean') ? 10 : undefined,
      maxCaloriesPer100g: quick.has('low') ? 100 : undefined,
    };
    const effectiveSort: FoodSort = sort === 'relevance' && !dq.trim() ? 'name' : sort;
    let list: Food[];
    if (cat === 'recent' && !dq.trim()) {
      list = Object.values(usage).filter(u => !u.key.startsWith('recipe:')).sort((a, b) => b.lastUsedAt - a.lastUsedAt).map(u => foodMap.get(u.key)).filter((f): f is Food => !!f);
      return list.filter(f => (!filters.minProteinPer100g || f.proteinPer100g >= filters.minProteinPer100g) && (!filters.maxCaloriesPer100g || f.caloriesPer100g <= filters.maxCaloriesPer100g));
    }
    list = searcher.search(dq, filters, effectiveSort, 2000);
    if (cat === 'custom-only') list = list.filter(f => f.source !== 'builtin');
    return list;
  }, [searcher, dq, cat, quick, sort, favSet, usage, foodMap]);

  const shown = results.slice(0, limit);
  const toggleQuick = (id: string) => setQuick(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const reset = () => { setLimit(60); };

  return (
    <>
      <PageHeader
        title="Foods" subtitle={`${results.length} shown`}
        right={<IconButton icon="plus" label="Create custom food" onClick={() => useUI.setState({ foodForm: {} })} className="bg-accentsoft text-accent" />}
      />
      <main className="px-4 pb-8 max-w-xl mx-auto">
        <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-10 bg-bg pt-3 pb-2 -mx-4 px-4">
          <div className="relative">
            <Icon name="search" size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q} onChange={e => { setQ(e.target.value); reset(); }} type="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              placeholder="Search foods (fuzzy)…" aria-label="Search foods"
              className="w-full h-12 rounded-2xl bg-surface pl-11 pr-4 text-[17px] outline-none border border-line focus:border-accent"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 mt-2.5">
            <Chip active={cat === 'all'} onClick={() => { setCat('all'); reset(); }}>All</Chip>
            <Chip active={cat === 'favorites'} onClick={() => { setCat('favorites'); reset(); }}>★ Favorites</Chip>
            <Chip active={cat === 'recent'} onClick={() => { setCat('recent'); reset(); }}>Recent</Chip>
            {customCount > 0 && <Chip active={cat === 'custom-only'} onClick={() => { setCat('custom-only'); reset(); }}>My foods</Chip>}
            {FOOD_CATEGORIES.filter(c => c !== 'custom').map(c => <Chip key={c} active={cat === c} onClick={() => { setCat(c); reset(); }}>{categoryLabel(c)}</Chip>)}
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 mt-2 items-center">
            {QUICK.map(f => <Chip key={f.id} accent active={quick.has(f.id)} onClick={() => { toggleQuick(f.id); reset(); }} className="!h-9 text-[14px]">{f.label}</Chip>)}
            <select
              value={sort} onChange={e => setSort(e.target.value as FoodSort)} aria-label="Sort"
              className="shrink-0 h-9 rounded-full bg-surface2 px-3 text-[14px] font-medium outline-none"
            >
              <option value="relevance">Sort: best match</option>
              <option value="name">Sort: name</option>
              <option value="protein">Sort: most protein</option>
              <option value="proteinDensity">Sort: protein per kcal</option>
              <option value="calories">Sort: fewest kcal</option>
            </select>
          </div>
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon="foods" title={cat === 'favorites' ? 'No favorites yet' : cat === 'recent' ? 'Nothing logged yet' : 'No foods found'}
            body={cat === 'favorites' ? 'Tap the star on any food to keep it here.' : 'Try a different word or filter — or add it yourself.'}
            action={q.trim() ? <Button variant="primary" onClick={() => useUI.setState({ foodForm: { name: q.trim(), logAfter: false } })}>Create “{q.trim()}”</Button> : undefined}
          />
        ) : (
          <div className="mt-1">
            {shown.map(f => (
              <FoodRow key={f.id} food={f} favorite={favSet.has(f.id)} onToggleFavorite={() => toggleFav(f.id)}
                onClick={() => useUI.setState({ foodDetailId: f.id })} onAdd={() => useUI.setState({ logFood: { foodId: f.id } })} />
            ))}
            {results.length > limit && <Button className="mt-3" block onClick={() => setLimit(l => l + 80)}>Show more ({results.length - limit} left)</Button>}
          </div>
        )}
      </main>
    </>
  );
}
