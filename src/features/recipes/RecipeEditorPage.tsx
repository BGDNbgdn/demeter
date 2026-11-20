import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CompareTable } from '../../components/CompareTable';
import { Button, IconButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, Confirm, EmptyState, Field, MacroGrid, Notice, PageHeader, SectionTitle, TextInput } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Chip, WeightInput } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { evenPortionG, fmtNum, portionNutrition, remainingBatch } from '../../lib/engine';
import {
  calcDraft, draftFromRecipe, emptyDraft, eatenFromBatch, ingredientFromFood, recipeFromDraft, type DraftIngredient, type RecipeDraft,
} from '../../lib/recipes';
import { newId } from '../../utils/id';
import { todayStr } from '../../utils/dates';
import { IngredientPicker } from './IngredientPicker';
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
        <PageHeader title="Recipe" left={<IconButton icon="chevL" label="Back" onClick={() => navigate('/recipes')} />} />
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
  const logs = useAppStore(s => s.logs);
  const saveRecipe = useAppStore(s => s.saveRecipe);
  const deleteRecipe = useAppStore(s => s.deleteRecipe);
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
  const [portion, setPortion] = useState<number | null>(existing?.portionSizesG[0] ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [showCookedFor, setShowCookedFor] = useState<Set<string>>(() => new Set(draft.ingredients.filter(i => i.cookedWeightG).map(i => i.id)));

  const calc = useMemo(() => calcDraft(draft), [draft]);
  const portionMacros = portion ? portionNutrition(calc, portion) : null;
  const hasWeights = draft.ingredients.some(i => (i.rawWeightG ?? 0) > 0);
  const canSave = draft.name.trim().length > 0 && draft.ingredients.length > 0 && hasWeights && calc.errors.length === 0;
  const eaten = existing ? eatenFromBatch(existing, logs) : 0;
  const remaining = remainingBatch(draft.cookedTotalWeightG, eaten, portion);
  const patch = (p: Partial<RecipeDraft>) => setDraft(d => ({ ...d, ...p }));
  const patchIng = (iid: string, p: Partial<DraftIngredient>) => setDraft(d => ({ ...d, ingredients: d.ingredients.map(i => (i.id === iid ? { ...i, ...p } : i)) }));

  const addIngredient = (food: Food) => {
    const ing = ingredientFromFood(food, null);
    setDraft(d => ({ ...d, ingredients: [...d.ingredients, ing] }));
    setFocusId(ing.id);
    setPickerOpen(false);
  };

  const save = async (): Promise<string | null> => {
    if (!canSave) return null;
    const portions = portion && !draft.portionSizesG.includes(portion) && draft.portionSizesG.length === 0 ? [portion] : draft.portionSizesG;
    const recipe = recipeFromDraft({ ...draft, portionSizesG: portions, batchStartedAt: draft.batchStartedAt ?? (draft.cookedTotalWeightG ? todayStr() : undefined) });
    await saveRecipe(recipe);
    initialJson.current = JSON.stringify({ ...draft, portionSizesG: portions, batchStartedAt: recipe.batchStartedAt });
    setDraft(d => ({ ...d, portionSizesG: portions, batchStartedAt: recipe.batchStartedAt }));
    showToast('Recipe saved', { tone: 'success' });
    if (!recipeId) navigate(`/recipes/${recipe.id}`, { replace: true });
    return recipe.id;
  };

  const logPortion = async () => {
    const rid = dirty || !recipeId ? await save() : recipeId;
    if (rid && portion) useUI.setState({ logRecipe: { recipeId: rid, weightG: portion } });
    else if (rid) useUI.setState({ logRecipe: { recipeId: rid } });
  };

  const savePortionSize = () => {
    if (!portion) return;
    patch({ portionSizesG: [...new Set([...draft.portionSizesG, portion])].sort((a, b) => a - b) });
    showToast(`Saved ${fmtNum(portion, 0)} g portion size`);
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
  const back = () => (dirty ? setConfirmLeave(true) : navigate('/recipes'));

  const changeLabel = calc.change
    ? `${calc.change.weightChangeG > 0 ? '+' : calc.change.weightChangeG < 0 ? '−' : ''}${fmtNum(Math.abs(calc.change.weightChangeG), 0)} g (${calc.change.direction === 'none' ? '0' : calc.change.direction === 'loss' ? '−' : '+'}${fmtNum(Math.abs(calc.change.lossPct), 1)}%)`
    : '—';

  return (
    <>
      <PageHeader
        title={recipeId ? 'Recipe' : 'New recipe'}
        left={<IconButton icon="chevL" label="Back" onClick={back} />}
        right={
          <>
            {recipeId && <IconButton icon="star" label="Favorite" filled={isFav} className={isFav ? 'text-accent' : 'text-muted'} onClick={() => toggleFavRecipe(recipeId)} />}
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
            {calc.status === 'raw-only' && <p className="text-[13px] text-muted">Enter the cooked weight above to see nutrition per 100 g of the finished dish.</p>}
            {calc.explanation && <p className="text-[14px] leading-snug" data-testid="explanation">{calc.explanation}</p>}
          </Card>
        </section>

        {/* ---------------- portion */}
        <section>
          <SectionTitle>4 · Your portion</SectionTitle>
          <Card className="space-y-4">
            <WeightInput
              value={portion} onChange={setPortion} step={25}
              servings={draft.portionSizesG.map(g => ({ label: 'Saved', grams: g }))}
              chips={[200, 250, 300, 350, 400, 500]}
              aria-label="Portion size in grams"
            />
            {calc.cookedTotalWeightG && (
              <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
                {[2, 3, 4, 5, 6].map(n => <Chip key={n} className="!h-9 !text-[14px]" onClick={() => setPortion(Math.round(evenPortionG(calc.cookedTotalWeightG, n)! * 10) / 10)}>÷ {n} · {fmtNum(calc.cookedTotalWeightG! / n, 0)} g</Chip>)}
              </div>
            )}
            {portionMacros ? <div data-testid="portion-macros"><MacroGrid m={portionMacros} big /></div> : <p className="text-[14px] text-muted">Pick a portion size to see its exact protein, calories, carbs and fat.</p>}
            {remaining && (
              <p className="text-[13px] text-muted">
                <b className="text-ink">{fmtNum(remaining.remainingG, 0)} g</b> left of {fmtNum(remaining.totalG, 0)} g{remaining.portionsLeft != null && portion ? ` · ≈ ${fmtNum(remaining.portionsLeft, 1)} portions` : ''}
                {existing ? ` · ${fmtNum(eaten, 0)} g already logged` : ''}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button icon="plus" disabled={!portion || draft.portionSizesG.includes(portion)} onClick={savePortionSize}>Save size</Button>
              <Button variant="primary" icon="check" disabled={!canSave || !portion} onClick={logPortion}>Log portion</Button>
            </div>
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

      <IngredientPicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={addIngredient} />
      <Confirm open={confirmDelete} danger title="Delete this recipe?" confirmLabel="Delete" message="Past log entries keep their saved nutrition."
        onCancel={() => setConfirmDelete(false)} onConfirm={async () => { if (recipeId) await deleteRecipe(recipeId); setConfirmDelete(false); showToast('Recipe deleted'); navigate('/recipes', { replace: true }); }} />
      <Confirm open={confirmLeave} title="Discard changes?" confirmLabel="Discard" danger message="You have unsaved changes to this recipe."
        onCancel={() => setConfirmLeave(false)} onConfirm={() => { setConfirmLeave(false); navigate('/recipes'); }} />
    </>
  );
}

