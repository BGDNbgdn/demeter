import { useDeferredValue, useMemo, useState } from 'react';
import { FoodRow } from '../../components/FoodRow';
import { Icon } from '../../components/ui/Icon';
import { SectionTitle } from '../../components/ui/misc';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtNum } from '../../lib/engine';
import { normalize } from '../../lib/search';
import type { Food, Recipe } from '../../types';

/** Fast global search: foods + recipes. Tap a result to log it. */
export function SearchOverlay() {
  const open = useUI(s => s.searchOpen);
  const close = () => useUI.setState({ searchOpen: false });
  const [q, setQ] = useState('');
  const dq = useDeferredValue(q);
  const searcher = useAppStore(s => s.searcher);
  const recipes = useAppStore(s => s.recipes);
  const usage = useAppStore(s => s.usage);
  const foodMap = useAppStore(s => s.foodMap);
  const favIds = useAppStore(s => s.settings.favoriteFoodIds);
  const toggleFav = useAppStore(s => s.toggleFavoriteFood);
  const onlineEnabled = useAppStore(s => s.settings.onlineLookupEnabled);

  const trimmed = dq.trim();
  const results = useMemo(() => (trimmed ? searcher.search(trimmed, undefined, 'relevance', 40) : []), [searcher, trimmed]);
  const recipeHits = useMemo(() => {
    if (!trimmed) return [];
    const n = normalize(trimmed);
    return recipes.filter(r => normalize(r.name).includes(n)).slice(0, 5);
  }, [recipes, trimmed]);

  const { recentFoods, recentRecipes } = useMemo(() => {
    const keys = Object.values(usage).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    const foods: Food[] = []; const recs: Recipe[] = [];
    for (const u of keys) {
      if (u.key.startsWith('recipe:')) { const r = recipes.find(x => `recipe:${x.id}` === u.key); if (r && recs.length < 4) recs.push(r); }
      else { const f = foodMap.get(u.key); if (f && foods.length < 10) foods.push(f); }
    }
    return { recentFoods: foods, recentRecipes: recs };
  }, [usage, recipes, foodMap]);
  const favFoods = useMemo(() => favIds.map(id => foodMap.get(id)).filter((f): f is Food => !!f).slice(0, 12), [favIds, foodMap]);

  const pickFood = (f: Food) => { close(); setQ(''); useUI.setState({ logFood: { foodId: f.id } }); };
  const pickRecipe = (r: Recipe) => { close(); setQ(''); useUI.setState({ logRecipe: { recipeId: r.id } }); };
  const list = (foods: Food[]) => foods.map(f => (
    <FoodRow key={f.id} food={f} onClick={() => pickFood(f)} favorite={favIds.includes(f.id)} onToggleFavorite={() => toggleFav(f.id)}
      onInfo={() => useUI.setState({ foodDetailId: f.id })} />
  ));
  const recipeRow = (r: Recipe) => (
    <button key={r.id} type="button" onClick={() => pickRecipe(r)} className="w-full flex items-center gap-3 py-3 text-left border-b border-line/60 active:opacity-60">
      <div className="h-9 w-9 rounded-xl bg-accentsoft text-accent flex items-center justify-center"><Icon name="recipes" size={20} /></div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{r.name}</div>
        <div className="text-[13px] text-muted">Recipe · {fmtNum((r.per100Cooked ?? r.per100Raw).protein, 1)} g protein / 100 g</div>
      </div>
    </button>
  );

  return (
    <Sheet open={open} onClose={close} tall title="Search foods & recipes" zIndex={70}>
      <div className="sticky top-0 -mx-5 px-5 pb-2 pt-1 [background:var(--sheet)] z-10">
        <div className="relative">
          <Icon name="search" size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            autoFocus value={q} onChange={e => setQ(e.target.value)} type="search" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            placeholder="Chicken breast, rice, whey…"
            className="w-full h-12 rounded-2xl bg-surface2 pl-11 pr-4 text-[17px] outline-none border border-transparent focus:border-accent"
            aria-label="Search foods and recipes"
          />
        </div>
      </div>

      {!trimmed && (
        <>
          {recentRecipes.length > 0 && <><SectionTitle>Recent recipes</SectionTitle>{recentRecipes.map(recipeRow)}</>}
          {recentFoods.length > 0 && <><SectionTitle>Recent</SectionTitle>{list(recentFoods)}</>}
          {favFoods.length > 0 && <><SectionTitle>Favorites</SectionTitle>{list(favFoods)}</>}
          {recentFoods.length === 0 && favFoods.length === 0 && recentRecipes.length === 0 && (
            <p className="text-[15px] text-muted px-2 py-8 text-center">Start typing to search 900+ foods, or tap a result to log it.<br />Foods you log appear here for quick re-adding.</p>
          )}
        </>
      )}

      {trimmed && (
        <>
          {recipeHits.length > 0 && <><SectionTitle>Recipes</SectionTitle>{recipeHits.map(recipeRow)}</>}
          {results.length > 0 && <><SectionTitle>Foods</SectionTitle>{list(results)}</>}
          {results.length === 0 && recipeHits.length === 0 && <p className="text-[15px] text-muted px-2 py-6 text-center">No match for “{trimmed}”.</p>}
          <SectionTitle>Not here?</SectionTitle>
          <div className="space-y-2 pb-4">
            <button type="button" onClick={() => { close(); useUI.setState({ foodForm: { name: trimmed, logAfter: true } }); }}
              className="w-full flex items-center gap-3 rounded-2xl bg-surface2 px-4 h-14 text-left active:bg-surface3">
              <Icon name="plus" className="text-accent" /> <span>Create custom food “{trimmed}”</span>
            </button>
            {onlineEnabled && (
              <button type="button" onClick={() => { close(); useUI.setState({ offOpen: true }); }}
                className="w-full flex items-center gap-3 rounded-2xl bg-surface2 px-4 h-14 text-left active:bg-surface3">
                <Icon name="globe" className="text-kcal" /> <span>Look up packaged products online</span>
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  );
}
