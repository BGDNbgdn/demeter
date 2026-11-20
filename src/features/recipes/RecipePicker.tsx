import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/misc';
import { Icon } from '../../components/ui/Icon';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtNum, remainingBatch } from '../../lib/engine';
import { eatenFromBatch } from '../../lib/recipes';

export function RecipePicker() {
  const open = useUI(s => s.recipePickerOpen);
  const recipes = useAppStore(s => s.recipes);
  const logs = useAppStore(s => s.logs);
  const navigate = useNavigate();
  const close = () => useUI.setState({ recipePickerOpen: false });
  return (
    <Sheet open={open} onClose={close} title="Recipe portion">
      {recipes.length === 0 ? (
        <EmptyState icon="recipes" title="No recipes yet" body="Build a recipe once — chicken, rice, whatever you meal-prep — then log portions in two taps."
          action={<Button variant="primary" onClick={() => { close(); navigate('/recipes/new'); }}>Create a recipe</Button>} />
      ) : (
        <div className="pt-1 pb-2">
          {recipes.map(r => {
            const rem = remainingBatch(r.cookedTotalWeightG, eatenFromBatch(r, logs));
            return (
              <button key={r.id} type="button" className="w-full flex items-center gap-3 py-3 text-left border-b border-line/60 active:opacity-60"
                onClick={() => { close(); useUI.setState({ logRecipe: { recipeId: r.id } }); }}>
                <div className="h-10 w-10 rounded-xl bg-accentsoft text-accent flex items-center justify-center"><Icon name="recipes" /></div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-[13px] text-muted">{fmtNum((r.per100Cooked ?? r.per100Raw).protein, 1)} g protein / 100 g{rem ? ` · ${fmtNum(rem.remainingG, 0)} g left` : ''}</div>
                </div>
                <Icon name="chevR" size={18} className="text-muted" />
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
