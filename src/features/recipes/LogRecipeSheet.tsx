import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { MacroGrid, Notice } from '../../components/ui/misc';
import { Sheet } from '../../components/ui/Sheet';
import { Chip, WeightInput } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { evenPortionG, fmtNum, nutritionForWeight, remainingBatch } from '../../lib/engine';
import { buildLogEntry } from '../../lib/logging';
import { eatenFromBatch, recipePer100ForLogging } from '../../lib/recipes';
import { MEAL_TYPES, type MealType, type Recipe } from '../../types';
import { defaultMealForNow, formatDayLabel } from '../../utils/dates';
import { MEAL_LABEL } from '../foods/LogFoodSheet';

export function LogRecipeSheet() {
  const req = useUI(s => s.logRecipe);
  const recipe = useAppStore(s => (req ? s.recipes.find(r => r.id === req.recipeId) : undefined));
  if (!req || !recipe) return null;
  return <Inner key={recipe.id} recipe={recipe} initialWeight={req.weightG} initialMeal={req.meal} />;
}

function Inner({ recipe, initialWeight, initialMeal }: { recipe: Recipe; initialWeight?: number; initialMeal?: MealType }) {
  const addLog = useAppStore(s => s.addLog);
  const recordUsage = useAppStore(s => s.recordUsage);
  const showToast = useAppStore(s => s.showToast);
  const logs = useAppStore(s => s.logs);
  const date = useAppStore(s => s.selectedDate);
  const usage = useAppStore(s => s.usage[`recipe:${recipe.id}`]);
  const navigate = useNavigate();
  const close = () => useUI.setState({ logRecipe: null });

  const [weight, setWeight] = useState<number | null>(initialWeight ?? usage?.lastWeightG ?? recipe.portionSizesG[0] ?? 300);
  const [meal, setMeal] = useState<MealType>(initialMeal ?? usage?.lastMealType ?? defaultMealForNow());

  const per100 = recipePer100ForLogging(recipe);
  const macros = nutritionForWeight(per100, weight ?? 0);
  const eaten = useMemo(() => eatenFromBatch(recipe, logs), [recipe, logs]);
  const remaining = remainingBatch(recipe.cookedTotalWeightG, eaten, weight);
  const rawOnly = !recipe.cookedTotalWeightG;

  const submit = async () => {
    if (!weight) return;
    const entry = buildLogEntry({ date, mealType: meal, recipeId: recipe.id, name: recipe.name, consumedWeightG: weight, per100 });
    await addLog(entry);
    void recordUsage(`recipe:${recipe.id}`, weight, meal);
    showToast(`Logged ${fmtNum(weight, 0)} g · ${fmtNum(entry.protein, 1)} g protein · ${fmtNum(entry.calories, 0)} kcal`, { tone: 'success' });
    close();
  };

  const splits = [2, 3, 4, 5, 6].map(n => ({ n, g: evenPortionG(recipe.cookedTotalWeightG, n) })).filter(x => x.g);

  return (
    <Sheet open onClose={close} title={<span className="block leading-tight"><span className="block text-[13px] font-medium text-muted">Log to {formatDayLabel(date)}</span>{recipe.name}</span>}
      footer={<Button variant="primary" size="lg" block disabled={!weight} onClick={submit}>Log {weight ? `${fmtNum(weight, 0)} g` : ''} · {fmtNum(macros.protein, 1)} g protein</Button>}>
      <div className="space-y-4 pt-1">
        {rawOnly && (
          <Notice tone="warn">
            No cooked weight entered yet, so this uses the <b>raw</b> nutrition density. Weigh the finished dish and enter it in the recipe for accurate portions.
            <button className="block mt-1 font-semibold text-accent" onClick={() => { close(); navigate(`/recipes/${recipe.id}`); }}>Open recipe</button>
          </Notice>
        )}
        <div className="text-[13px] text-muted px-1 tabular">
          Per 100 g {rawOnly ? 'raw' : 'cooked'}: <b className="text-protein">{fmtNum(per100.protein, 1)}</b> P · {fmtNum(per100.carbs, 1)} C · {fmtNum(per100.fat, 1)} F · {fmtNum(per100.calories, 1)} kcal
        </div>
        <WeightInput
          value={weight} onChange={setWeight} step={25}
          servings={recipe.portionSizesG.map(g => ({ label: 'Portion', grams: g }))}
          chips={[100, 200, 250, 300, 350, 400, 500]}
        />
        {splits.length > 0 && (
          <div>
            <div className="text-[13px] font-medium text-muted mb-1.5 px-1">Or split the whole dish evenly</div>
            <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5">
              {splits.map(s => <Chip key={s.n} active={weight !== null && Math.abs(weight - s.g!) < 0.05} onClick={() => setWeight(Math.round(s.g! * 10) / 10)}>÷ {s.n} · {fmtNum(s.g!, 0)} g</Chip>)}
            </div>
          </div>
        )}
        <MacroGrid m={macros} big />
        {remaining && (
          <p className="text-[13px] text-muted px-1">
            Batch: {fmtNum(remaining.eatenG, 0)} g of {fmtNum(remaining.totalG, 0)} g eaten · <b className="text-ink">{fmtNum(remaining.remainingG, 0)} g left</b>
            {remaining.portionsLeft != null && weight ? ` (≈ ${fmtNum(remaining.portionsLeft, 1)} portions of ${fmtNum(weight, 0)} g)` : ''}
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
