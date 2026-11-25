import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../components/ui/Button';
import { MacroGrid, Notice, Segmented } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { Chip, WeightInput } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtNum, nutritionForWeight, remainingBatch } from '../../lib/engine';
import { buildLogEntry } from '../../lib/logging';
import { eatenFromBatch, gramsToPortions, portionCount, portionWeightG, portionsToGrams, recipePer100ForLogging } from '../../lib/recipes';
import { MEAL_TYPES, type MealType, type Recipe } from '../../types';
import { defaultMealForNow, formatDayLabel } from '../../utils/dates';
import { MEAL_LABEL } from '../foods/LogFoodSheet';

export function LogRecipeSheet() {
  const req = useUI(s => s.logRecipe);
  const recipe = useAppStore(s => (req ? s.recipes.find(r => r.id === req.recipeId) : undefined));
  if (!req || !recipe) return null;
  return <Inner key={recipe.id} recipe={recipe} initialWeight={req.weightG} initialPortions={req.portions} initialMeal={req.meal} />;
}

const half = (n: number) => Math.max(0.5, Math.round(n * 2) / 2);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Log what you ate as a number of portions (the recipe knows how many portions it makes) — or, if you prefer, in grams. */
function Inner({ recipe, initialWeight, initialPortions, initialMeal }: { recipe: Recipe; initialWeight?: number; initialPortions?: number; initialMeal?: MealType }) {
  const addLog = useAppStore(s => s.addLog);
  const recordUsage = useAppStore(s => s.recordUsage);
  const showToast = useAppStore(s => s.showToast);
  const logs = useAppStore(s => s.logs);
  const date = useAppStore(s => s.selectedDate);
  const usage = useAppStore(s => s.usage[`recipe:${recipe.id}`]);
  const navigate = useNavigate();
  const close = () => useUI.setState({ logRecipe: null });

  const count = portionCount(recipe);
  const portionW = portionWeightG(recipe);
  const startPortions = initialPortions ?? (initialWeight ? half(gramsToPortions(recipe, initialWeight)) : usage?.lastWeightG ? half(gramsToPortions(recipe, usage.lastWeightG)) : 1);
  const [mode, setMode] = useState<'portions' | 'grams'>(initialWeight && !initialPortions ? 'grams' : 'portions');
  const [n, setN] = useState<number | null>(startPortions);
  const [gramsInput, setGramsInput] = useState<number | null>(initialWeight ?? portionW);
  const [meal, setMeal] = useState<MealType>(initialMeal ?? usage?.lastMealType ?? defaultMealForNow());

  const weight = mode === 'portions' ? (n ? portionsToGrams(recipe, n) : null) : gramsInput;
  const per100 = recipePer100ForLogging(recipe);
  const macros = nutritionForWeight(per100, weight ?? 0);
  const eaten = useMemo(() => eatenFromBatch(recipe, logs), [recipe, logs]);
  const remaining = remainingBatch(recipe.cookedTotalWeightG, eaten, portionW);
  const rawOnly = !recipe.cookedTotalWeightG;
  const portionsEaten = mode === 'portions' ? n : weight ? r2(gramsToPortions(recipe, weight)) : null;
  const label = (x: number | null) => (x == null ? '' : `${fmtNum(x, 2)} portion${x === 1 ? '' : 's'}`);

  const submit = async () => {
    if (!weight) return;
    const entry = buildLogEntry({ date, mealType: meal, recipeId: recipe.id, name: recipe.name, consumedWeightG: weight, per100 });
    await addLog(mode === 'portions' && n ? { ...entry, portions: n } : entry);
    void recordUsage(`recipe:${recipe.id}`, weight, meal);
    showToast(`Logged ${mode === 'portions' ? `${label(n)} · ` : ''}${fmtNum(weight, 0)} g · ${fmtNum(entry.protein, 1)} g protein · ${fmtNum(entry.calories, 0)} kcal`, { tone: 'success' });
    close();
  };

  const chips = [...new Set([0.5, 1, 2, 3, 4, ...(Number.isInteger(count) && count > 4 && count <= 12 ? [count] : [])])].sort((a, b) => a - b);

  return (
    <Sheet open onClose={close} title={<span className="block leading-tight"><span className="block text-[13px] font-medium text-muted">Log to {formatDayLabel(date)}</span>{recipe.name}</span>}
      footer={<Button variant="primary" size="lg" block disabled={!weight} onClick={submit}>Log {mode === 'portions' ? label(n) : weight ? `${fmtNum(weight, 0)} g` : ''} · {fmtNum(macros.protein, 1)} g protein</Button>}>
      <div className="space-y-4 pt-1">
        {rawOnly && (
          <Notice tone="warn">
            No cooked weight entered yet, so this uses the <b>raw</b> weight. Weigh the finished dish and enter it in the recipe for accurate portions.
            <button className="block mt-1 font-semibold text-accent" onClick={() => { close(); navigate(`/recipes/${recipe.id}`); }}>Open recipe</button>
          </Notice>
        )}
        <Segmented value={mode} onChange={setMode} options={[{ value: 'portions', label: 'Portions' }, { value: 'grams', label: 'Grams' }]} />

        {mode === 'portions' ? (
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <IconButton icon="minus" label="Half a portion less" tone="glass" size={48} disabled={!n || n <= 0.5} onClick={() => setN(x => Math.max(0.5, r2((x ?? 1) - 0.5)))} />
              <NumInput value={n} onChange={setN} suffix={n === 1 ? 'portion' : 'portions'} decimals={2} placeholder="1" className="flex-1" inputClassName="text-center text-[22px] font-semibold h-14 !pr-20" aria-label="Number of portions" />
              <IconButton icon="plus" label="Half a portion more" tone="glass" size={48} onClick={() => setN(x => r2((x ?? 0) + 0.5))} />
            </div>
            <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5 pb-0.5">
              {chips.map(c => <Chip key={c} active={n === c} onClick={() => setN(c)}>{c === count && count > 4 ? `All ${c}` : c}</Chip>)}
            </div>
            <p className="text-[14px] px-1 tabular" data-testid="portion-summary">
              {n ? <><b>{label(n)}</b> = <b>{fmtNum(portionsToGrams(recipe, n), 0)} g</b></> : 'Enter how many portions you ate.'}
              <span className="text-muted"> · the recipe makes {fmtNum(count, 2)} ({fmtNum(portionW, 0)} g each)</span>
            </p>
          </div>
        ) : (
          <>
            <div className="text-[13px] text-muted px-1 tabular">
              Per 100 g {rawOnly ? 'raw' : 'cooked'}: <b className="text-protein">{fmtNum(per100.protein, 1)}</b> P · {fmtNum(per100.carbs, 1)} C · {fmtNum(per100.fat, 1)} F · {fmtNum(per100.calories, 1)} kcal
            </div>
            <WeightInput
              value={gramsInput} onChange={setGramsInput} step={25}
              servings={[{ label: 'Portion', grams: Math.round(portionW * 10) / 10 }, ...recipe.portionSizesG.filter(g => Math.abs(g - portionW) > 0.5).map(g => ({ label: 'Saved', grams: g }))]}
              chips={[100, 200, 250, 300, 350, 400, 500]}
            />
            {portionsEaten != null && weight ? <p className="text-[13px] text-muted px-1">≈ {label(portionsEaten)}</p> : null}
          </>
        )}

        <MacroGrid m={macros} big />
        {remaining && (
          <p className="text-[13px] text-muted px-1">
            Batch: {fmtNum(remaining.eatenG, 0)} g of {fmtNum(remaining.totalG, 0)} g eaten · <b className="text-ink">{fmtNum(remaining.remainingG / portionW, 1)} portions left</b> ({fmtNum(remaining.remainingG, 0)} g)
            {remaining.overEaten ? ' — you have logged more than the batch weight.' : ''}
          </p>
        )}
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5">
          {MEAL_TYPES.map(m => <Chip key={m} active={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>)}
        </div>
      </div>
    </Sheet>
  );
}
