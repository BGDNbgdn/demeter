import { useMemo, useState } from 'react';
import { BasisBadge, MacroGrid, Notice, Segmented } from '../../components/ui/misc';
import { Button, IconButton } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { Chip, WeightInput } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import {
  foodPer100, fmtNum, nutritionForWeight, resolveCooking, type CookingResult,
} from '../../lib/engine';
import { cookedName, defaultWeightFor } from '../../lib/foodNames';
import { buildLogEntry } from '../../lib/logging';
import { batchRecipeFromFood } from '../../lib/recipes';
import { defaultMealForNow, formatDayLabel } from '../../utils/dates';
import { MEAL_TYPES, type Food, type MealType } from '../../types';
import { CookPanel } from './CookPanel';
import { Icon } from '../../components/ui/Icon';

export const MEAL_LABEL: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

export function LogFoodSheet() {
  const req = useUI(s => s.logFood);
  const food = useAppStore(s => (req ? s.foodMap.get(req.foodId) : undefined));
  const close = () => useUI.setState({ logFood: null });
  if (!req || !food) return null;
  return <LogFoodInner key={food.id} food={food} initialMeal={req.meal} initialWeight={req.weightG} onClose={close} />;
}

function LogFoodInner({ food, initialMeal, initialWeight, onClose }: { food: Food; initialMeal?: MealType; initialWeight?: number; onClose: () => void }) {
  const addLog = useAppStore(s => s.addLog);
  const recordUsage = useAppStore(s => s.recordUsage);
  const saveRecipe = useAppStore(s => s.saveRecipe);
  const showToast = useAppStore(s => s.showToast);
  const usage = useAppStore(s => s.usage[food.id]);
  const date = useAppStore(s => s.selectedDate);
  const isFav = useAppStore(s => s.settings.favoriteFoodIds.includes(food.id));
  const toggleFav = useAppStore(s => s.toggleFavoriteFood);

  const canCook = food.nutritionBasis !== 'cooked' && (food.nutritionBasis === 'raw' || !!food.defaultCookedWeightRetentionPercent);
  const [mode, setMode] = useState<'direct' | 'cooked'>('direct');
  const [weight, setWeight] = useState<number | null>(initialWeight ?? usage?.lastWeightG ?? defaultWeightFor(food));
  const [meal, setMeal] = useState<MealType>(initialMeal ?? usage?.lastMealType ?? defaultMealForNow());
  const [batchRaw, setBatchRaw] = useState<number | null>(null);
  const [batchCooked, setBatchCooked] = useState<number | null>(null);

  const per100 = useMemo(() => foodPer100(food), [food]);
  const retention = food.defaultCookedWeightRetentionPercent;

  // ---- calculations (update instantly as weights change)
  const usingTypical = mode === 'cooked' && batchRaw == null && batchCooked == null && !!retention;
  const cooking: CookingResult | null = useMemo(() => {
    if (mode !== 'cooked') return null;
    if (usingTypical) {
      if (!weight) return null;
      return resolveCooking({ basis: food.nutritionBasis, per100g: per100, cookedWeightG: weight, defaultRetentionPercent: retention, label: food.name.split(',')[0] });
    }
    if (batchRaw == null && batchCooked == null) return null;
    return resolveCooking({ basis: food.nutritionBasis, per100g: per100, rawWeightG: batchRaw, cookedWeightG: batchCooked, defaultRetentionPercent: retention, label: food.name.split(',')[0] });
  }, [mode, usingTypical, weight, batchRaw, batchCooked, food, per100, retention]);

  const effectivePer100 = mode === 'cooked' ? cooking?.per100Cooked ?? null : per100;
  const macros = effectivePer100 && weight ? nutritionForWeight(effectivePer100, weight) : nutritionForWeight(per100, 0);
  const blocked = !weight || weight <= 0 || (mode === 'cooked' && (!effectivePer100 || (cooking?.errors.length ?? 0) > 0));

  const logIt = async () => {
    if (!weight || !effectivePer100) return;
    const isCooked = mode === 'cooked';
    const entry = buildLogEntry({
      date, mealType: meal, foodId: food.id, consumedWeightG: weight, per100: effectivePer100,
      name: isCooked ? cookedName(food.name) : food.name,
      ...(isCooked && cooking?.rawWeightG && cooking.cookedWeightG
        ? { cooking: { rawWeightG: cooking.rawWeightG, cookedWeightG: cooking.cookedWeightG, ...(cooking.status === 'estimated-raw' ? { estimated: true } : {}) } }
        : {}),
    });
    await addLog(entry);
    void recordUsage(food.id, weight, meal);
    showToast(`Logged ${fmtNum(weight, 0)} g · ${fmtNum(entry.protein, 1)} g protein · ${fmtNum(entry.calories, 0)} kcal`, { tone: 'success' });
    onClose();
  };

  const saveBatch = async () => {
    if (!cooking?.rawWeightG || !cooking.cookedWeightG || !weight) return;
    const recipe = batchRecipeFromFood(food, cooking.rawWeightG, cooking.cookedWeightG, weight, date);
    await saveRecipe(recipe);
    const entry = buildLogEntry({
      date, mealType: meal, recipeId: recipe.id, name: recipe.name, consumedWeightG: weight,
      per100: recipe.per100Cooked ?? recipe.per100Raw,
      cooking: { rawWeightG: cooking.rawWeightG, cookedWeightG: cooking.cookedWeightG },
    });
    await addLog(entry);
    void recordUsage(`recipe:${recipe.id}`, weight, meal);
    showToast('Batch saved in Recipes — log future portions from there', { tone: 'success' });
    onClose();
  };

  const basisLabel = food.nutritionBasis === 'as-packaged' ? 'as packed' : 'raw';

  return (
    <Sheet
      open
      onClose={onClose}
      title={<span className="block leading-tight"><span className="block text-[13px] font-medium text-muted">Log to {formatDayLabel(date)}</span>{food.name}</span>}
      headerRight={<IconButton icon="star" label={isFav ? 'Remove favorite' : 'Favorite'} filled={isFav} className={isFav ? 'text-accent' : 'text-muted'} onClick={() => toggleFav(food.id)} />}
      footer={
        <div className="space-y-2">
          <Button variant="primary" size="lg" block disabled={blocked} onClick={logIt}>
            Log {weight ? `${fmtNum(weight, 0)} g` : ''} · {fmtNum(macros.protein, 1)} g protein
          </Button>
          {mode === 'cooked' && cooking?.rawWeightG && cooking.cookedWeightG && cooking.status === 'converted' && (
            <Button variant="ghost" block icon="layers" disabled={blocked} onClick={saveBatch}>Save batch as recipe & log</Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="flex items-center gap-2 flex-wrap text-[13px] text-muted">
          <BasisBadge basis={food.nutritionBasis} />
          <span className="tabular">per 100 g: <b className="text-protein">{fmtNum(food.proteinPer100g, 1)}</b> P · {fmtNum(food.carbsPer100g, 1)} C · {fmtNum(food.fatPer100g, 1)} F · {fmtNum(food.caloriesPer100g, 0)} kcal</span>
        </div>

        {canCook && (
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'direct', label: food.nutritionBasis === 'raw' ? 'Weighed raw' : 'As listed' },
              { value: 'cooked', label: 'Cooked (convert)' },
            ]}
          />
        )}

        {mode === 'cooked' && (
          <CookPanel
            rawW={batchRaw} cookedW={batchCooked} onRawChange={setBatchRaw} onCookedChange={setBatchCooked}
            result={cooking} retention={retention} usingTypical={usingTypical} basisLabel={basisLabel}
          />
        )}

        <div>
          <div className="text-[13px] font-medium text-muted mb-1.5 px-1">
            {mode === 'cooked' ? 'How much cooked food are you eating?' : 'Amount'}
          </div>
          <WeightInput
            value={weight} onChange={setWeight}
            servings={mode === 'direct' ? food.servings : undefined}
            step={food.category === 'fat' || food.category === 'sauce' ? 5 : 10}
            chips={food.category === 'fat' || food.category === 'sauce' ? [5, 10, 15, 20, 30, 50] : undefined}
            suffix={food.isLiquid ? 'g/ml' : 'g'}
          />
        </div>

        <MacroGrid m={macros} big />
        {food.isLiquid && <p className="text-[12px] text-muted -mt-2 px-1">Liquids are treated as 1 g = 1 ml.</p>}

        {food.note && <Notice tone="info"><span className="text-[13px]">{food.note}</span></Notice>}

        <div>
          <div className="text-[13px] font-medium text-muted mb-1.5 px-1">Meal</div>
          <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5">
            {MEAL_TYPES.map(m => <Chip key={m} active={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>)}
          </div>
        </div>

        {mode === 'direct' && retention && food.nutritionBasis === 'raw' && (
          <p className="text-[13px] text-muted px-1 flex gap-1.5"><Icon name="info" size={16} className="shrink-0 mt-0.5" />
            This is raw nutrition. If you weighed it after cooking, switch to “Cooked (convert)” so the lost water is accounted for.</p>
        )}
      </div>
    </Sheet>
  );
}
