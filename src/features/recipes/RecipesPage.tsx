import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, EmptyState, PageHeader } from '../../components/ui/misc';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtNum, remainingBatch } from '../../lib/engine';
import { eatenFromBatch } from '../../lib/recipes';

export function RecipesPage() {
  const recipes = useAppStore(s => s.recipes);
  const logs = useAppStore(s => s.logs);
  const favs = useAppStore(s => s.settings.favoriteRecipeIds);
  const toggleFav = useAppStore(s => s.toggleFavoriteRecipe);
  const navigate = useNavigate();
  const sorted = [...recipes].sort((a, b) => Number(favs.includes(b.id)) - Number(favs.includes(a.id)) || b.updatedAt - a.updatedAt);

  return (
    <>
      <PageHeader title="Recipes" subtitle="Cooked dishes & meal-prep batches"
        right={<IconButton icon="plus" label="New recipe" className="bg-accentsoft text-accent" onClick={() => navigate('/recipes/new')} />} />
      <main className="px-4 pb-8 max-w-xl mx-auto">
        {sorted.length === 0 ? (
          <EmptyState
            icon="recipes" title="No recipes yet"
            body="Add raw ingredients, weigh the finished dish, and Demeter works out the exact nutrition per 100 g cooked — then any portion."
            action={<Button variant="primary" size="lg" icon="plus" onClick={() => navigate('/recipes/new')}>Create a recipe</Button>}
          />
        ) : (
          <div className="space-y-3 pt-3">
            {sorted.map(r => {
              const per100 = r.per100Cooked ?? r.per100Raw;
              const rem = remainingBatch(r.cookedTotalWeightG, eatenFromBatch(r, logs));
              const fav = favs.includes(r.id);
              return (
                <Card key={r.id} className="!p-0 overflow-hidden">
                  <div className="flex items-stretch">
                    <button type="button" className="flex-1 min-w-0 text-left p-4 active:bg-surface2" onClick={() => navigate(`/recipes/${r.id}`)}>
                      <div className="text-[18px] font-semibold truncate">{r.name}</div>
                      <div className="text-[13px] text-muted mt-0.5 tabular">
                        {r.ingredients.length} ingredient{r.ingredients.length === 1 ? '' : 's'} · {r.cookedTotalWeightG ? `${fmtNum(r.cookedTotalWeightG, 0)} g cooked` : <span className="text-warn">cooked weight not entered</span>}
                      </div>
                      <div className="flex items-baseline gap-4 mt-2.5 tabular">
                        <span><b className="text-[22px] text-protein">{fmtNum(per100.protein, 1)}</b><span className="text-[12px] text-muted"> g protein</span></span>
                        <span><b className="text-[17px] text-kcal">{fmtNum(per100.calories, 0)}</b><span className="text-[12px] text-muted"> kcal</span></span>
                        <span className="text-[12px] text-muted">per 100 g {r.per100Cooked ? 'cooked' : 'raw'}</span>
                      </div>
                      {rem && <div className="text-[13px] mt-2 text-muted">{rem.remainingG > 0 ? <><b className="text-ink">{fmtNum(rem.remainingG, 0)} g</b> left in this batch</> : 'Batch finished'}</div>}
                    </button>
                    <div className="flex flex-col border-l border-line/60">
                      <button aria-label={fav ? 'Unfavorite' : 'Favorite'} className={`flex-1 w-14 flex items-center justify-center ${fav ? 'text-accent' : 'text-muted/60'}`} onClick={() => toggleFav(r.id)}>
                        <Icon name="star" filled={fav} />
                      </button>
                      <button aria-label={`Log a portion of ${r.name}`} className="flex-1 w-14 flex items-center justify-center text-accent bg-accentsoft active:opacity-60 border-t border-line/60" onClick={() => useUI.setState({ logRecipe: { recipeId: r.id } })}>
                        <Icon name="plus" strokeWidth={2.4} />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
