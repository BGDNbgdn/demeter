import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Notice, Segmented, TextInput } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { Chip } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { atwaterKcal, fmtNum } from '../../lib/engine';
import { FOOD_CATEGORIES, type Food, type FoodCategory, type NutritionBasis } from '../../types';
import { newId } from '../../utils/id';

const CAT_LABEL: Record<FoodCategory, string> = {
  protein: 'Protein', carb: 'Carb', fat: 'Fat', vegetable: 'Vegetable', fruit: 'Fruit', dairy: 'Dairy', sauce: 'Sauce',
  beverage: 'Beverage', supplement: 'Supplement', snack: 'Snack', other: 'Other', custom: 'Custom',
};
export const categoryLabel = (c: FoodCategory) => CAT_LABEL[c];

export function FoodFormSheet() {
  const req = useUI(s => s.foodForm);
  const base = useAppStore(s => (req?.foodId ? s.foodMap.get(req.foodId) : undefined));
  if (!req) return null;
  return <FormInner key={`${req.foodId ?? 'new'}-${req.duplicate ? 'dup' : ''}-${req.name ?? ''}`} base={base} duplicate={!!req.duplicate} initialName={req.name} prefill={req.prefill} logAfter={!!req.logAfter} />;
}

function FormInner({ base, duplicate, initialName, prefill, logAfter }: { base?: Food; duplicate: boolean; initialName?: string; prefill?: Partial<Food>; logAfter: boolean }) {
  const saveFood = useAppStore(s => s.saveFood);
  const showToast = useAppStore(s => s.showToast);
  const close = () => useUI.setState({ foodForm: null });
  const editing = !!base && !duplicate && base.source !== 'builtin';
  const src = { ...(base ?? {}), ...(prefill ?? {}) } as Partial<Food>;

  const [name, setName] = useState(duplicate && base ? `${base.name} (copy)` : (src.name ?? initialName ?? ''));
  const [brand, setBrand] = useState(src.brand ?? '');
  const [category, setCategory] = useState<FoodCategory>(src.category && src.category !== 'custom' ? src.category : 'custom');
  const [basis, setBasis] = useState<NutritionBasis>(src.nutritionBasis ?? 'as-packaged');
  const [protein, setProtein] = useState<number | null>(src.proteinPer100g ?? null);
  const [carbs, setCarbs] = useState<number | null>(src.carbsPer100g ?? null);
  const [fat, setFat] = useState<number | null>(src.fatPer100g ?? null);
  const [kcal, setKcal] = useState<number | null>(src.caloriesPer100g ?? null);
  const [kcalTouched, setKcalTouched] = useState(src.caloriesPer100g != null);
  const [fiber, setFiber] = useState<number | null>(src.fiberPer100g ?? null);
  const [liquid, setLiquid] = useState(!!src.isLiquid);
  const [retention, setRetention] = useState<number | null>(src.defaultCookedWeightRetentionPercent ?? null);
  const [servLabel, setServLabel] = useState(src.servings?.[0]?.label ?? '');
  const [servG, setServG] = useState<number | null>(src.servings?.[0]?.grams ?? null);
  const [tried, setTried] = useState(false);

  const calc = Math.round(atwaterKcal({ protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 }));
  const shownKcal = kcalTouched ? kcal : calc;
  const macroSum = (protein ?? 0) + (carbs ?? 0) + (fat ?? 0);
  const errors: string[] = [];
  if (!name.trim()) errors.push('Give the food a name.');
  if (protein == null || carbs == null || fat == null) errors.push('Enter protein, carbs and fat per 100 g (0 is fine).');
  if (macroSum > 100.5) errors.push('Protein + carbs + fat cannot exceed 100 g per 100 g of food.');
  if (shownKcal == null || shownKcal < 0 || shownKcal > 905) errors.push('Calories per 100 g must be between 0 and 900.');
  if (retention != null && (retention < 20 || retention > 700)) errors.push('Cooked yield should be between 20% and 700% of the raw weight.');
  const kcalWarn = shownKcal != null && calc > 20 && Math.abs(shownKcal - calc) / calc > 0.3 && !liquid;

  const save = async () => {
    setTried(true);
    if (errors.length) return;
    const now = Date.now();
    const food: Food = {
      id: editing && base ? base.id : newId('food'),
      name: name.trim(),
      ...(brand.trim() ? { brand: brand.trim() } : {}),
      category,
      proteinPer100g: protein ?? 0, carbsPer100g: carbs ?? 0, fatPer100g: fat ?? 0, caloriesPer100g: shownKcal ?? 0,
      ...(fiber ? { fiberPer100g: fiber } : {}),
      isLiquid: liquid,
      ...(retention && basis !== 'cooked' ? { defaultCookedWeightRetentionPercent: retention } : {}),
      nutritionBasis: basis,
      source: prefill?.source === 'imported' ? 'imported' : 'custom',
      ...(servG && servG > 0 ? { servings: [{ label: servLabel.trim() || `1 serving`, grams: servG }] } : {}),
      ...(src.aliases ? { aliases: src.aliases } : {}),
      ...(prefill?.barcode || base?.barcode ? { barcode: prefill?.barcode ?? base?.barcode } : {}),
      createdAt: editing && base ? base.createdAt : now,
      updatedAt: now,
    };
    await saveFood(food);
    close();
    showToast(editing ? 'Food updated' : 'Food saved', { tone: 'success' });
    if (logAfter) useUI.setState({ logFood: { foodId: food.id } });
  };

  const title = editing ? 'Edit food' : duplicate ? 'Duplicate food' : 'New food';
  const n = (v: number | null, set: (x: number | null) => void, label: string, color: string, suffix = 'g') => (
    <Field label={<span style={{ color }}>{label}</span>}>
      <NumInput value={v} onChange={set} suffix={suffix} placeholder="0" invalid={tried && v == null} />
    </Field>
  );

  return (
    <Sheet open onClose={close} title={title} tall footer={<Button variant="primary" size="lg" block onClick={save}>{editing ? 'Save changes' : 'Save food'}</Button>}>
      <div className="space-y-4 pt-1">
        <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Homemade granola" autoCapitalize="sentences" /></Field>
        <Field label="Brand (optional)"><TextInput value={brand} onChange={e => setBrand(e.target.value)} placeholder="e.g. Tesco" /></Field>

        <Field label="Nutrition values are for the food…" hint={basis === 'cooked' ? 'Per 100 g after cooking.' : basis === 'raw' ? 'Per 100 g before cooking — Demeter can convert to cooked when you weigh the result.' : 'Per 100 g as sold / as eaten without cooking.'}>
          <Segmented value={basis} onChange={setBasis} options={[{ value: 'raw', label: 'Raw' }, { value: 'cooked', label: 'Cooked' }, { value: 'as-packaged', label: 'As packaged' }]} />
        </Field>

        <div>
          <div className="text-[13px] font-medium text-muted mb-1.5 px-1">Per 100 g</div>
          <div className="grid grid-cols-2 gap-3">
            {n(protein, setProtein, 'Protein', 'var(--protein)')}
            {n(carbs, setCarbs, 'Carbs', 'var(--carbs)')}
            {n(fat, setFat, 'Fat', 'var(--fat)')}
            <Field label={<span style={{ color: 'var(--calories)' }}>Calories</span>}>
              <NumInput value={shownKcal} onChange={v => { setKcal(v); setKcalTouched(true); }} suffix="kcal" placeholder="0" />
            </Field>
            <Field label="Fibre (optional)"><NumInput value={fiber} onChange={setFiber} suffix="g" placeholder="0" /></Field>
          </div>
          {!kcalTouched && <p className="text-[12px] text-muted mt-1.5 px-1">Calories are calculated from the macros ({calc} kcal). Type a value to override.</p>}
          {kcalTouched && calc !== shownKcal && (
            <button type="button" className="text-[13px] text-accent mt-1.5 px-1" onClick={() => { setKcalTouched(false); setKcal(null); }}>Use calculated {calc} kcal</button>
          )}
        </div>

        {kcalWarn && <Notice tone="warn">Calories ({shownKcal}) differ a lot from what the macros add up to ({calc} kcal). Double-check the label.</Notice>}

        <Field label="Category">
          <div className="flex flex-wrap gap-2">
            {FOOD_CATEGORIES.map(c => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{CAT_LABEL[c]}</Chip>)}
          </div>
        </Field>

        {basis !== 'cooked' && (
          <Field label="Typical cooked yield (optional)" hint="Cooked weight as a % of raw weight, e.g. chicken ≈ 75, white rice ≈ 280. Used when you log cooked food without knowing the raw weight.">
            <NumInput value={retention} onChange={setRetention} suffix="%" placeholder="e.g. 75" />
          </Field>
        )}

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field label="Typical serving (optional)"><TextInput value={servLabel} onChange={e => setServLabel(e.target.value)} placeholder="1 scoop" /></Field>
          <Field label="Grams"><NumInput value={servG} onChange={setServG} suffix="g" placeholder="30" /></Field>
        </div>

        <label className="flex items-center justify-between rounded-2xl bg-surface2 px-4 h-14">
          <span className="text-[16px]">This is a liquid (1 g = 1 ml)</span>
          <input type="checkbox" checked={liquid} onChange={e => setLiquid(e.target.checked)} className="h-6 w-6 accent-[var(--accent)]" />
        </label>

        {tried && errors.length > 0 && <Notice tone="error"><ul className="list-disc pl-4">{errors.map(e => <li key={e}>{e}</li>)}</ul></Notice>}
        <p className="text-[12px] text-muted px-1">Saved on this device only. Per-100 g macros: {fmtNum(macroSum, 1)} g of 100 g.</p>
      </div>
    </Sheet>
  );
}
