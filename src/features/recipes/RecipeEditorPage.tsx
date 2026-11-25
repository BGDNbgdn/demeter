import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CompareTable } from '../../components/CompareTable';
import { Button, IconButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, Confirm, EmptyState, Field, MacroGrid, Notice, PageHeader, SectionTitle, TextInput } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Chip } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { currencyOf, fmtMoney, portionCost, recipeCost } from '../../lib/cost';
import { fmtNum, remainingBatch, scaleMacros } from '../../lib/engine';
import {
  applyDrift, calcDraft, describeDrift, draftFromRecipe, emptyDraft, eatenFromBatch, findIngredientDrift, ingredientFromFood, recipeFromDraft, scaleDraft, type DraftIngredient, type RecipeDraft,
} from '../../lib/recipes';
import { newId } from '../../utils/id';
import { todayStr } from '../../utils/dates';
import { IngredientPicker } from './IngredientPicker';
import { ScaleSheet } from './ScaleSheet';
import type { Food } from '../../types';

export function RecipeEditorPage() {
  const { id } = useParams();
  const isNew = id === 'new';
  const recipes = useAppStore(s => s.recipes);
  const existing = isNew ? undefined : recipes.find(r => r.id === id);
  const navigate = useNavigate();
  if (!isNew && !existing) {
    return (
      <>
        <PageHeader title="Recipe" left={<IconButton icon="chevL" label="Back" tone="glass" onClick={() => navigate('/recipes')} />} />
        <EmptyState icon="recipes" title="Recipe not found" action={<Button onClick={() => navigate('/recipes')}>Back to recipes</Button>} />
      </>
    );
  }
  return <Editor key={id} recipeId={existing?.id} />;
}

function Editor({ recipeId }: { recipeId?: string }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const existing = useAppStore(s => s.recipes.find(r => r.id === recipeId));
  const foodMap = useAppStore(s => s.foodMap);
  const prices = useAppStore(s => s.prices);
  const currency = useAppStore(s => currencyOf(s.settings));
  const logs = useAppStore(s => s.logs);
  const saveRecipe = useAppStore(s => s.saveRecipe);
  const deleteRecipe = useAppStore(s => s.deleteRecipe);
  const restoreRecipe = useAppStore(s => s.restoreRecipe);
  const showToast = useAppStore(s => s.showToast);
  const isFav = useAppStore(s => (recipeId ? s.settings.favoriteRecipeIds.includes(recipeId) : false));
  const toggleFavRecipe = useAppStore(s => s.toggleFavoriteRecipe);

  const [draft, setDraft] = useState<RecipeDraft>(() => {
    if (existing) return draftFromRecipe(existing);
    const d = emptyDraft();
    const f = params.get('food') ? foodMap.get(params.get('food')!) : undefined;
    if (f) d.ingredients.push(ingredientFromFood(f, null));
    return d;
  });
  const initialJson = useRef(JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== initialJson.current;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(draft.ingredients[0]?.rawWeightG == null ? draft.ingredients[0]?.id ?? null : null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [scaleOpen, setScaleOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showCookedFor, setShowCookedFor] = useState<Set<string>>(() => new Set(draft.ingredients.filter(i => i.cookedWeightG).map(i => i.id)));

  const calc = useMemo(() => calcDraft(draft), [draft]);
  const drifts = useMemo(() => findIngredientDrift(draft.ingredients, fid => foodMap.get(fid)), [draft.ingredients, foodMap]);
  const changedDrifts = drifts.filter(d => d.kind === 'changed');
  // one portion = the whole dish ÷ how many portions it makes
  const totalG = calc.cookedTotalWeightG ?? calc.rawTotalWeightG;
  const portions = draft.portions > 0 ? draft.portions : 1;
  const portionW = totalG > 0 ? totalG / portions : 0;
  const portionMacros = totalG > 0 ? scaleMacros(calc.totals, 1 / portions) : null;
  const cost = useMemo(
    () => recipeCost({ ingredients: draft.ingredients, cookedTotalWeightG: calc.cookedTotalWeightG, totals: calc.totals }, fid => prices[fid]),
    [draft.ingredients, calc.cookedTotalWeightG, calc.totals, prices],
  );
  const portionPrice = portionW > 0 ? portionCost(cost, portionW) : null;
  const hasWeights = draft.ingredients.some(i => (i.rawWeightG ?? 0) > 0);
  const canSave = draft.name.trim().length > 0 && draft.ingredients.length > 0 && hasWeights && calc.errors.length === 0;
  const eaten = existing ? eatenFromBatch(existing, logs) : 0;
  const remaining = remainingBatch(draft.cookedTotalWeightG, eaten, portionW > 0 ? portionW : null);
  const patch = (p: Partial<RecipeDraft>) => setDraft(d => ({ ...d, ...p }));
  const patchIng = (iid: string, p: Partial<DraftIngredient>) => setDraft(d => ({ ...d, ingredients: d.ingredients.map(i => (i.id === iid ? { ...i, ...p } : i)) }));

  const addIngredients = (foods: Food[]) => {
    const added = foods.map(f => ingredientFromFood(f, null));
    if (added.length === 0) { setPickerOpen(false); return; }
    setDraft(d => ({ ...d, ingredients: [...d.ingredients, ...added] }));
    setFocusId(added[0].id);
    setPickerOpen(false);
  };

  const save = async (): Promise<string | null> => {
    if (!canSave) return null;
    const recipe = recipeFromDraft({ ...draft, batchStartedAt: draft.batchStartedAt ?? (draft.cookedTotalWeightG ? todayStr() : undefined) });
    await saveRecipe(recipe);
    const saved = { ...draft, portions: recipe.portions ?? 1, portionSizesG: recipe.portionSizesG, batchStartedAt: recipe.batchStartedAt };
    initialJson.current = JSON.stringify(saved);
    setDraft(saved);
    showToast('Recipe saved', { tone: 'success' });
    if (!recipeId) navigate(`/recipes/${recipe.id}`, { replace: true });
    return recipe.id;
  };

  const logPortion = async () => {
    const rid = dirty || !recipeId ? await save() : recipeId;
    if (rid) useUI.setState({ logRecipe: { recipeId: rid, portions: 1 } });
  };
  const duplicate = async () => {
    const copy = { ...draft, id: newId('rec'), name: `${draft.name || 'Recipe'} (copy)`, createdAt: Date.now(), batchStartedAt: undefined };
    await saveRecipe(recipeFromDraft(copy));
    showToast('Copy saved', { tone: 'success' });
    navigate(`/recipes/${copy.id}`);
  };
  const newBatch = () => {
    patch({ cookedTotalWeightG: null, batchStartedAt: todayStr() });
    showToast('New batch: weigh the finished dish, then save');
  };
  const applyScale = (f: number) => {
    const before = draft;
    setDraft(scaleDraft(draft, f));
    setScaleOpen(false);
    showToast(`Scaled ×${fmtNum(f, 2)}${recipeId ? ' — tap Save to keep it' : ''}`, { actionLabel: 'Undo', onAction: () => setDraft(before) });
  };
  const copyScaled = async (f: number) => {
    const scaled = scaleDraft(draft, f);
    const copy: RecipeDraft = { ...scaled, id: newId('rec'), name: `${draft.name.trim() || 'Recipe'} ×${fmtNum(f, 2)}`, createdAt: Date.now(), batchStartedAt: scaled.cookedTotalWeightG ? todayStr() : undefined };
    const rec = recipeFromDraft(copy);
    await saveRecipe(rec);
    setScaleOpen(false);
    showToast(`Saved “${rec.name}”`, { tone: 'success' });
    navigate(`/recipes/${rec.id}`);
  };
  const back = () => (dirty ? setConfirmLeave(true) : navigate('/recipes'));

  const changeLabel = calc.change
    ? `${calc.change.weightChangeG > 0 ? '+' : calc.change.weightChangeG < 0 ? '−' : ''}${fmtNum(Math.abs(calc.change.weightChangeG), 0)} g (${calc.change.direction === 'none' ? '0' : calc.change.direction === 'loss' ? '−' : '+'}${fmtNum(Math.abs(calc.change.lossPct), 1)}%)`
    : '—';

  return (
    <>
      <PageHeader
        sticky
        title={recipeId ? 'Recipe' : 'New recipe'}
        left={<IconButton icon="chevL" label="Back" tone="glass" onClick={back} />}
        right={
          <>
            {recipeId && <IconButton icon="star" label="Favorite" filled={isFav} tone="glass" className={isFav ? 'text-[var(--carbs)]' : 'text-muted'} onClick={() => toggleFavRecipe(recipeId)} />}
            <Button variant="primary" size="sm" className="mr-1 !h-10 px-4" disabled={!canSave || (!dirty && !!recipeId)} onClick={() => void save()}>Save</Button>
          </>
        }
      />
      <main className="px-4 pb-10 max-w-xl mx-auto space-y-4 pt-3">
        <Field label="Recipe name">
          <TextInput value={draft.name} onChange={e => patch({ name: e.target.value })} placeholder="Chicken & potato bake" autoCapitalize="sentences" />
        </Field>

        {/* ---------------- ingredients */}
        <section>
          <SectionTitle right={<span className="text-[13px] text-muted tabular">{fmtNum(calc.rawTotalWeightG, 0)} g raw</span>}>1 · Raw ingredients</SectionTitle>
          {drifts.length > 0 && (
            <div className="space-y-2 mb-3" data-testid="drift-banner">
              {changedDrifts.map(d => (
                <Notice key={d.ingredientId} tone="warn">
                  <div className="text-[14px]"><b>{d.name}</b> changed in your foods: {describeDrift(d.before, d.after ?? d.before, !!d.food && draft.ingredients.find(i => i.id === d.ingredientId)?.nutritionBasis !== d.food.nutritionBasis)} (per 100 g).</div>
                  <button className="mt-1.5 font-semibold text-accent" onClick={() => { setDraft(x => applyDrift(x, [d])); showToast(`${d.name} updated — tap Save`, { tone: 'success' }); }}>Update this recipe</button>
                </Notice>
              ))}
              {changedDrifts.length > 1 && <Button size="sm" variant="secondary" onClick={() => { setDraft(x => applyDrift(x, changedDrifts)); showToast('All ingredients updated — tap Save', { tone: 'success' }); }}>Update all {changedDrifts.length}</Button>}
              {drifts.filter(d => d.kind === 'missing').map(d => (
                <p key={d.ingredientId} className="text-[12px] text-muted px-1">“{d.name}” was deleted from your foods — this recipe keeps its saved values.</p>
              ))}
            </div>
          )}
          <Card className="!p-0 overflow-hidden">
            {draft.ingredients.length === 0 && (
              <div className="px-5 py-8 text-center text-muted text-[15px]">Add each ingredient with its <b>raw</b> weight (what you put in the pan).</div>
            )}
            {draft.ingredients.map((ing, idx) => {
              const res = calc.ingredients[idx];
              const showCooked = showCookedFor.has(ing.id);
              return (
                <div key={ing.id} className="px-4 py-3 border-b border-line/60 last:border-b-0">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="text-[16px] font-medium leading-snug">{ing.name}</div>
                      <div className="text-[12px] text-muted tabular">per 100 g: {fmtNum(ing.per100g.protein, 1)} P · {fmtNum(ing.per100g.carbs, 1)} C · {fmtNum(ing.per100g.fat, 1)} F · {fmtNum(ing.per100g.calories, 0)} kcal</div>
                    </div>
                    <button aria-label={`Remove ${ing.name}`} className="h-9 w-9 -mr-2 flex items-center justify-center text-muted active:text-danger" onClick={() => setDraft(d => ({ ...d, ingredients: d.ingredients.filter(i => i.id !== ing.id) }))}>
                      <Icon name="x" size={20} />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <NumInput value={ing.rawWeightG} onChange={v => patchIng(ing.id, { rawWeightG: v })} suffix="g" placeholder="Raw weight" autoFocus={focusId === ing.id} className="flex-1" inputClassName="h-11 !text-[17px]" aria-label={`${ing.name} raw weight in grams`} />
                    <div className="text-right text-[13px] tabular w-[84px] shrink-0">
                      <div><b className="text-protein text-[15px]">{fmtNum(res?.contribution.protein ?? 0, 1)}</b> g P</div>
                      <div className="text-muted">{fmtNum(res?.contribution.calories ?? 0, 0)} kcal</div>
                    </div>
                  </div>
                  {!showCooked ? (
                    <button className="text-[13px] text-accent mt-1.5 h-7" onClick={() => setShowCookedFor(s => new Set(s).add(ing.id))}>+ cooked weight of this ingredient (optional)</button>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <NumInput value={ing.cookedWeightG ?? null} onChange={v => patchIng(ing.id, { cookedWeightG: v })} suffix="g cooked" placeholder="Cooked weight" className="flex-1" inputClassName="h-11 !text-[16px]" aria-label={`${ing.name} cooked weight`} />
                      {res?.per100Cooked && <div className="text-[12px] text-muted w-[84px] text-right tabular shrink-0"><b className="text-protein">{fmtNum(res.per100Cooked.protein, 1)}</b> g P /100 g cooked</div>}
                    </div>
                  )}
                  {res?.errors.map(e => <p key={e.message} className="text-[12px] text-danger mt-1">{e.message}</p>)}
                  {res?.warnings.map(w => <p key={w.message} className="text-[12px] text-warn mt-1">{w.message}</p>)}
                </div>
              );
            })}
            <button type="button" onClick={() => setPickerOpen(true)} className="w-full h-14 flex items-center justify-center gap-2 text-accent font-semibold active:bg-accentsoft">
              <Icon name="plus" /> Add ingredient
            </button>
          </Card>
          {hasWeights && (
            <button type="button" onClick={() => setScaleOpen(true)} className="mt-2 w-full h-11 flex items-center justify-center gap-2 rounded-2xl text-[15px] font-medium text-ink bg-surface2 active:bg-surface3">
              <Icon name="scale" size={18} /> Scale recipe (×0.5, ×1.5, ×2…)
            </button>
          )}
        </section>

        {/* ---------------- cooked weight */}
        <section>
          <SectionTitle>2 · After cooking</SectionTitle>
          <Card className="space-y-3">
            <Field label="Total weight of the finished dish" hint="Weigh everything you cooked (minus the pan). Water lost or absorbed is handled for you.">
              <div className="flex gap-2 items-center">
                <NumInput value={draft.cookedTotalWeightG} onChange={v => patch({ cookedTotalWeightG: v })} suffix="g" placeholder={calc.rawTotalWeightG ? `e.g. ${Math.round(calc.rawTotalWeightG * 0.8)}` : '1750'} className="flex-1" inputClassName="h-14 !text-[22px] font-semibold" aria-label="Total cooked weight in grams" invalid={calc.errors.some(e => e.code === 'invalid-cooked-weight')} />
              </div>
            </Field>
            {calc.cookedWeightSource === 'sum-of-ingredients' && <Notice tone="info">Using the sum of your ingredient cooked weights: <b>{fmtNum(calc.cookedTotalWeightG ?? 0, 0)} g</b>.</Notice>}
            {calc.errors.map(e => <Notice key={e.message} tone="error">{e.message}</Notice>)}
            {calc.warnings.filter((w, i, a) => a.findIndex(x => x.message === w.message) === i).slice(0, 3).map(w => <Notice key={w.message} tone="warn">{w.message}</Notice>)}
          </Card>
        </section>

        {/* ---------------- summary */}
        <section>
          <SectionTitle>3 · Results</SectionTitle>
          <Card className="space-y-4" data-testid="recipe-summary">
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-surface2 py-2.5"><dt className="text-[11px] uppercase tracking-wide text-muted font-semibold">Raw total</dt><dd className="text-[18px] font-bold tabular" data-testid="raw-total">{fmtNum(calc.rawTotalWeightG, 0)} g</dd></div>
              <div className="rounded-2xl bg-surface2 py-2.5"><dt className="text-[11px] uppercase tracking-wide text-muted font-semibold">Cooked total</dt><dd className="text-[18px] font-bold tabular" data-testid="cooked-total">{calc.cookedTotalWeightG ? `${fmtNum(calc.cookedTotalWeightG, 0)} g` : '—'}</dd></div>
              <div className="rounded-2xl bg-surface2 py-2.5"><dt className="text-[11px] uppercase tracking-wide text-muted font-semibold">Change</dt><dd className={`text-[15px] leading-[27px] font-bold tabular ${calc.change?.direction === 'gain' ? 'text-warn' : ''}`}>{changeLabel}</dd></div>
            </dl>

            <div>
              <div className="text-[13px] font-medium text-muted mb-1.5 px-1">Whole recipe (before = after cooking)</div>
              <MacroGrid m={calc.totals} />
            </div>

            <CompareTable raw={calc.rawTotalWeightG ? calc.per100Raw : null} cooked={calc.per100Cooked} />
            {cost.priced > 0 && (
              <div className="rounded-2xl bg-surface2 p-3.5 text-[14px] tabular space-y-1" data-testid="recipe-cost">
                <div className="flex justify-between"><span className="text-muted">Ingredients cost</span><b className="text-[17px]">{fmtMoney(cost.total, currency)}{cost.missing.length > 0 ? '+' : ''}</b></div>
                {cost.per100Cooked != null && <div className="flex justify-between"><span className="text-muted">Per 100 g cooked</span><b>{fmtMoney(cost.per100Cooked, currency)}</b></div>}
                {portionPrice != null && <div className="flex justify-between"><span className="text-muted">One portion ({fmtNum(portionW, 0)} g)</span><b>{fmtMoney(portionPrice, currency)}</b></div>}
                {cost.per20gProtein != null && <div className="flex justify-between"><span className="text-muted">20 g of protein costs</span><b className="text-protein">{fmtMoney(cost.per20gProtein, currency)}</b></div>}
                {cost.missing.length > 0 && <p className="text-[12px] text-muted pt-1">No price for {cost.missing.slice(0, 4).join(', ')}{cost.missing.length > 4 ? '…' : ''} — the real cost is a bit higher. Add prices in Kitchen → Value.</p>}
              </div>
            )}
            {calc.status === 'raw-only' && <p className="text-[13px] text-muted">Enter the cooked weight above to see nutrition per 100 g of the finished dish.</p>}
            {calc.explanation && <p className="text-[14px] leading-snug" data-testid="explanation">{calc.explanation}</p>}
          </Card>
        </section>

        {/* ---------------- portions */}
        <section>
          <SectionTitle>4 · Portions</SectionTitle>
          <Card className="space-y-4">
            <Field label="This recipe makes" hint="When you log it, you pick how many portions you ate — 2 portions of a 4-portion recipe is half of everything.">
              <NumInput value={draft.portions} onChange={v => patch({ portions: v ?? 0 })} suffix="portions" decimals={2} placeholder="1" aria-label="Number of portions the recipe makes" />
            </Field>
            <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
              {[1, 2, 3, 4, 5, 6, 8, 10].map(n => <Chip key={n} active={portions === n} className="!h-9 !text-[14px]" onClick={() => patch({ portions: n })}>{n}</Chip>)}
            </div>
            {portionMacros ? (
              <div data-testid="portion-macros" className="space-y-2">
                <p className="text-[14px] px-1">1 portion = <b>{fmtNum(portionW, 0)} g</b>{calc.cookedTotalWeightG ? '' : ' (raw weight — enter the cooked weight above for the real one)'}</p>
                <MacroGrid m={portionMacros} big />
              </div>
            ) : <p className="text-[14px] text-muted">Add ingredient weights to see what one portion gives you.</p>}
            {remaining && portionW > 0 && (
              <p className="text-[13px] text-muted">
                <b className="text-ink">{fmtNum(remaining.remainingG / portionW, 1)} portions</b> left ({fmtNum(remaining.remainingG, 0)} g of {fmtNum(remaining.totalG, 0)} g)
                {existing ? ` · ${fmtNum(eaten, 0)} g already logged` : ''}
              </p>
            )}
            <Button variant="primary" block icon="check" disabled={!canSave} onClick={logPortion}>Log 1 portion</Button>
          </Card>
        </section>

        {recipeId && (
          <section className="space-y-2 pt-2">
            <Button block icon="refresh" onClick={newBatch}>Cook again (start a new batch)</Button>
            <Button block icon="copy" onClick={duplicate}>Duplicate recipe</Button>
            <Button block variant="danger" icon="trash" onClick={() => setConfirmDelete(true)}>Delete recipe</Button>
          </section>
        )}
      </main>

      <IngredientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={f => addIngredients([f])} onPickMany={addIngredients} />
      <ScaleSheet open={scaleOpen} onClose={() => setScaleOpen(false)} draft={draft} canCopy={!!recipeId} onApply={applyScale} onCopy={copyScaled} />
      <Confirm open={confirmDelete} danger title="Delete this recipe?" confirmLabel="Delete" message="Past log entries keep their saved nutrition. You can undo this right after, or later from Settings → Recently deleted."
        onCancel={() => setConfirmDelete(false)} onConfirm={async () => {
          const rid = recipeId;
          if (rid) await deleteRecipe(rid);
          setConfirmDelete(false);
          showToast('Recipe deleted', rid ? { actionLabel: 'Undo', onAction: () => { void restoreRecipe(rid); } } : {});
          navigate('/recipes', { replace: true });
        }} />
      <Confirm open={confirmLeave} title="Discard changes?" confirmLabel="Discard" danger message="You have unsaved changes to this recipe."
        onCancel={() => setConfirmLeave(false)} onConfirm={() => { setConfirmLeave(false); navigate('/recipes'); }} />
    </>
  );
}

