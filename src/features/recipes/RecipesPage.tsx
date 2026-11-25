import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, EmptyState, PageHeader } from '../../components/ui/misc';
import { SwipeRow } from '../../components/ui/SwipeRow';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtNum, remainingBatch } from '../../lib/engine';
import { eatenFromBatch, findIngredientDrift, portionCount, portionWeightG } from '../../lib/recipes';

export function RecipesPage() {
  const recipes = useAppStore(s => s.recipes);
  const logs = useAppStore(s => s.logs);
  const foodMap = useAppStore(s => s.foodMap);
  const favs = useAppStore(s => s.settings.favoriteRecipeIds);
  const toggleFav = useAppStore(s => s.toggleFavoriteRecipe);
  const deleteRecipe = useAppStore(s => s.deleteRecipe);
  const restoreRecipe = useAppStore(s => s.restoreRecipe);
  const showToast = useAppStore(s => s.showToast);
  const navigate = useNavigate();
  const sorted = [...recipes].sort((a, b) => Number(favs.includes(b.id)) - Number(favs.includes(a.id)) || b.updatedAt - a.updatedAt);

  return (
    <>
      <PageHeader title="Recipes" subtitle="Cooked dishes & meal-prep batches"
        right={<IconButton icon="plus" label="New recipe" tone="accent" onClick={() => navigate('/recipes/new')} />} />
      <main className="px-4 pb-8 max-w-xl mx-auto">
        {sorted.length === 0 ? (
          <>
            <EmptyState
              icon="recipes" title="No recipes yet."
              body="Add raw ingredients, weigh the finished dish, and Demeter works out the exact nutrition per 100 g cooked — then any portion."
            />
            <ol className="glass rounded-[26px] py-1.5 list-none">
              {['Add the raw ingredients', 'Weigh the finished dish', 'Get nutrition per 100 g cooked'].map((t, i) => (
                <li key={t} className="flex items-center gap-3.5 px-[18px] py-[11px] text-[16px] font-semibold border-t border-line first:border-t-0">
                  <span className="bg-grad h-[30px] w-[30px] rounded-full flex items-center justify-center text-[14px] font-extrabold shrink-0" style={{ boxShadow: 'none' }}>{i + 1}</span>{t}
                </li>
              ))}
            </ol>
            <Button variant="primary" size="lg" block icon="plus" className="mt-3.5 !h-[60px] text-[17px]" onClick={() => navigate('/recipes/new')}>Create a recipe</Button>
          </>
        ) : (
          <div className="space-y-3 pt-3">
            {sorted.map(r => {
              const per100 = r.per100Cooked ?? r.per100Raw;
              const rem = remainingBatch(r.cookedTotalWeightG, eatenFromBatch(r, logs));
              const fav = favs.includes(r.id);
              const changed = findIngredientDrift(r.ingredients, id => foodMap.get(id)).filter(d => d.kind === 'changed').length;
              return (
                <SwipeRow key={r.id} radius="rounded-[28px]" actionLabel="Delete"
                  onAction={async () => { await deleteRecipe(r.id); showToast(`“${r.name}” deleted`, { actionLabel: 'Undo', onAction: () => void restoreRecipe(r.id) }); }}>
                <Card className="!p-0 overflow-hidden">
                  <div className="flex items-stretch">
                    <button type="button" className="flex-1 min-w-0 text-left p-4 active:bg-surface2" onClick={() => navigate(`/recipes/${r.id}`)}>
                      <div className="text-[19px] font-bold tracking-[-0.01em] truncate">{r.name}</div>
                      {changed > 0 && <div className="inline-block mt-1 text-[11px] font-semibold text-warn px-2 py-0.5 rounded-md bg-warn/15" style={{ background: 'color-mix(in srgb, var(--warn) 15%, transparent)' }}>{changed} ingredient{changed === 1 ? '' : 's'} changed — open to update</div>}
                      <div className="text-[13px] text-muted mt-0.5 tabular">
                        {r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'} · {r.cookedTotalWeightG ? `${fmtNum(r.cookedTotalWeightG, 0)} g cooked` : <span className="text-warn">cooked weight not entered</span>}
                      </div>
                      <div className="flex items-baseline gap-4 mt-2.5 tabular">
                        <span><b className="text-[22px] text-protein">{fmtNum(per100.protein, 1)}</b><span className="text-[12px] text-muted"> g protein</span></span>
                        <span><b className="text-[17px] text-kcal">{fmtNum(per100.calories, 0)}</b><span className="text-[12px] text-muted"> kcal</span></span>
                        <span className="text-[12px] text-muted">per 100 g {r.per100Cooked ? 'cooked' : 'raw'}</span>
                      </div>
                      <div className="text-[13px] mt-2 text-muted tabular">{fmtNum(portionCount(r), 2)} portion{portionCount(r) === 1 ? '' : 's'} · {fmtNum(portionWeightG(r), 0)} g each</div>
                      {rem && <div className="text-[13px] mt-0.5 text-muted">{rem.remainingG > 0 ? <><b className="text-ink">{fmtNum(rem.remainingG / portionWeightG(r), 1)} portions</b> left in this batch</> : 'Batch finished'}</div>}
                    </button>
                    <div className="flex flex-col items-center justify-center gap-1.5 pr-3.5 pl-1">
                      <button aria-label={fav ? 'Unfavorite' : 'Favorite'} className={`h-10 w-10 rounded-full flex items-center justify-center active:bg-surface2 ${fav ? 'text-[var(--carbs)]' : 'text-muted'}`} onClick={() => toggleFav(r.id)}>
                        <Icon name="star" filled={fav} />
                      </button>
                      <button aria-label={`Log a portion of ${r.name}`} className="bg-grad h-11 w-11 rounded-full flex items-center justify-center active:opacity-70" style={{ boxShadow: 'none' }} onClick={() => useUI.setState({ logRecipe: { recipeId: r.id } })}>
                        <Icon name="plus" strokeWidth={2.4} />
                      </button>
                    </div>
                  </div>
                </Card>
                </SwipeRow>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
