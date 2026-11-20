import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../components/ui/Button';
import { BasisBadge, Confirm, MacroGrid, Notice, SectionTitle } from '../../components/ui/misc';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtNum, foodPer100, nutritionForWeight, scaleMacros } from '../../lib/engine';
import { categoryLabel } from './FoodFormSheet';

export function FoodDetailSheet() {
  const id = useUI(s => s.foodDetailId);
  const food = useAppStore(s => (id ? s.foodMap.get(id) : undefined));
  const fav = useAppStore(s => (id ? s.settings.favoriteFoodIds.includes(id) : false));
  const toggleFav = useAppStore(s => s.toggleFavoriteFood);
  const deleteFood = useAppStore(s => s.deleteFood);
  const restoreFood = useAppStore(s => s.restoreFood);
  const showToast = useAppStore(s => s.showToast);
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const close = () => useUI.setState({ foodDetailId: null });
  if (!id || !food) return null;

  const per100 = foodPer100(food);
  const ret = food.defaultCookedWeightRetentionPercent;
  const typicalCooked = ret && food.nutritionBasis !== 'cooked' ? scaleMacros(per100, 100 / ret) : null;
  const custom = food.source !== 'builtin';
  const sourceLabel = food.source === 'imported' ? 'Open Food Facts (imported)' : food.source === 'custom' ? 'Custom food' : food.usdaId ? `USDA FoodData Central #${food.usdaId}` : 'Typical label values';

  return (
    <Sheet
      open onClose={close} zIndex={60}
      title={<span className="block leading-tight">{food.name}{food.brand && <span className="block text-[13px] font-medium text-muted">{food.brand}</span>}</span>}
      headerRight={<IconButton icon="star" label={fav ? 'Remove favorite' : 'Favorite'} filled={fav} className={fav ? 'text-accent' : 'text-muted'} onClick={() => toggleFav(food.id)} />}
      footer={
        <div className="flex gap-2">
          <Button variant="primary" size="lg" block onClick={() => { close(); useUI.setState({ logFood: { foodId: food.id } }); }}>Log this food</Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <BasisBadge basis={food.nutritionBasis} />
          <span className="px-2 py-0.5 rounded-md bg-surface2">{categoryLabel(food.category)}</span>
          {food.isLiquid && <span className="px-2 py-0.5 rounded-md bg-surface2">Liquid</span>}
        </div>

        <div>
          <div className="text-[13px] font-medium text-muted mb-1.5 px-1">Per 100 g {food.nutritionBasis === 'raw' ? '(raw)' : food.nutritionBasis === 'cooked' ? '(cooked)' : ''}</div>
          <MacroGrid m={per100} />
          {food.fiberPer100g ? <p className="text-[13px] text-muted mt-2 px-1">Fibre {fmtNum(food.fiberPer100g, 1)} g per 100 g</p> : null}
        </div>

        {typicalCooked && ret && (
          <Notice tone="info">
            Typically cooks to about <b>{fmtNum(ret, 0)}%</b> of its raw weight. After cooking that is roughly <b>{fmtNum(typicalCooked.protein, 1)} g protein</b> and <b>{fmtNum(typicalCooked.calories, 0)} kcal</b> per 100 g. For exact numbers, weigh your batch raw and cooked — choose “Cooked (convert)” when logging.
          </Notice>
        )}

        {food.servings && food.servings.length > 0 && (
          <div>
            <SectionTitle>Common servings</SectionTitle>
            <div className="rounded-2xl bg-surface2 divide-y divide-line/60">
              {food.servings.map(s => {
                const m = nutritionForWeight(per100, s.grams);
                return (
                  <button key={s.label} type="button" className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-surface3 first:rounded-t-2xl last:rounded-b-2xl"
                    onClick={() => { close(); useUI.setState({ logFood: { foodId: food.id, weightG: s.grams } }); }}>
                    <span className="text-[15px]">{s.label} <span className="text-muted">· {fmtNum(s.grams, 1)} g</span></span>
                    <span className="text-[14px] tabular"><b className="text-protein">{fmtNum(m.protein, 1)}</b> P · {fmtNum(m.calories, 0)} kcal</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="text-[13px] text-muted px-1">Source: {sourceLabel}</div>
        {food.note && <p className="text-[13px] text-muted px-1">{food.note}</p>}

        <div className="grid grid-cols-2 gap-2 pt-1">
          {custom ? (
            <Button icon="edit" onClick={() => { close(); useUI.setState({ foodForm: { foodId: food.id } }); }}>Edit</Button>
          ) : (
            <Button icon="copy" onClick={() => { close(); useUI.setState({ foodForm: { foodId: food.id, duplicate: true } }); }}>Duplicate & edit</Button>
          )}
          {custom && <Button icon="copy" onClick={() => { close(); useUI.setState({ foodForm: { foodId: food.id, duplicate: true } }); }}>Duplicate</Button>}
          {food.nutritionBasis !== 'cooked' && (
            <Button icon="layers" className={custom ? 'col-span-2' : ''} onClick={() => { close(); navigate(`/recipes/new?food=${encodeURIComponent(food.id)}`); }}>Start a recipe with this</Button>
          )}
          {custom && <Button variant="danger" icon="trash" className="col-span-2" onClick={() => setConfirmDelete(true)}>Delete food</Button>}
        </div>
      </div>
      <Confirm
        open={confirmDelete} danger title="Delete this food?" confirmLabel="Delete"
        message="Past log entries and recipes keep their saved numbers. You can undo this right after, or later from Settings → Recently deleted."
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => { const id = food.id; await deleteFood(id); setConfirmDelete(false); close(); showToast('Food deleted', { actionLabel: 'Undo', onAction: () => void restoreFood(id) }); }}
      />
    </Sheet>
  );
}
