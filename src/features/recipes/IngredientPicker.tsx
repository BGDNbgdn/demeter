import { useDeferredValue, useMemo, useState } from 'react';
import { FoodRow } from '../../components/FoodRow';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Field, Notice, Segmented, SectionTitle, TextInput } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { ScanButton, ScanFoodSheet } from '../openfoodfacts/ScanFoodSheet';
import { atwaterKcal } from '../../lib/engine';
import type { Food, NutritionBasis } from '../../types';
import { newId } from '../../utils/id';

/**
 * Pick a food from the database, from what is in your fridge, by scanning its barcode — or create a custom one.
 * With `onPickMany` you tick several (recipes: add all the ingredients in one go).
 */
export function IngredientPicker({ open, onClose, onPick, onPickMany, title, hint = true, allowCustom = true }: {
  open: boolean; onClose: () => void; onPick: (food: Food) => void;
  /** Multi-select mode: tapping toggles, the footer adds everything ticked. */
  onPickMany?: (foods: Food[]) => void;
  /** Sheet title (default "Add ingredient"). */
  title?: string;
  /** Show the "pick the raw version" tip (recipes only). */
  hint?: boolean;
  allowCustom?: boolean;
}) {
  const multi = !!onPickMany;
  const [mode, setMode] = useState<'search' | 'custom'>('search');
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const [selected, setSelected] = useState<Map<string, Food>>(new Map());
  const dq = useDeferredValue(q);
  const searcher = useAppStore(s => s.searcher);
  const usage = useAppStore(s => s.usage);
  const foodMap = useAppStore(s => s.foodMap);
  const favIds = useAppStore(s => s.settings.favoriteFoodIds);
  const pantry = useAppStore(s => s.pantry);

  const results = useMemo(() => (dq.trim() ? searcher.search(dq, undefined, 'relevance', 40) : []), [searcher, dq]);
  const recent = useMemo(
    () => Object.values(usage).filter(u => !u.key.startsWith('recipe:')).sort((a, b) => b.lastUsedAt - a.lastUsedAt).map(u => foodMap.get(u.key)).filter((f): f is Food => !!f).slice(0, 8),
    [usage, foodMap],
  );
  const favs = useMemo(() => favIds.map(i => foodMap.get(i)).filter((f): f is Food => !!f).slice(0, 8), [favIds, foodMap]);
  /** What you have at home, oldest first — the natural list to cook from. */
  const fridge = useMemo(() => {
    const seen = new Set<string>(); const out: Food[] = [];
    for (const i of [...pantry].sort((a, b) => (a.boughtAt ?? '').localeCompare(b.boughtAt ?? ''))) {
      const f = i.foodId ? foodMap.get(i.foodId) : undefined;
      if (f && !seen.has(f.id)) { seen.add(f.id); out.push(f); }
    }
    return out;
  }, [pantry, foodMap]);

  const reset = () => { setQ(''); setMode('search'); setSelected(new Map()); };
  const pick = (f: Food) => { reset(); onPick(f); };
  const toggle = (f: Food) => setSelected(m => { const n = new Map(m); if (n.has(f.id)) n.delete(f.id); else n.set(f.id, f); return n; });
  const choose = (f: Food) => (multi ? toggle(f) : pick(f));
  const finish = (extra?: Food) => {
    const foods = [...selected.values(), ...(extra && !selected.has(extra.id) ? [extra] : [])];
    reset(); onPickMany?.(foods);
  };
  const row = (f: Food) => (
    <FoodRow key={f.id} food={f} onClick={() => choose(f)}
      leading={multi ? (
        <span aria-hidden className={`mr-2 h-7 w-7 shrink-0 rounded-full flex items-center justify-center ${selected.has(f.id) ? 'bg-grad' : 'bg-surface2 text-transparent'}`} style={selected.has(f.id) ? { boxShadow: 'none' } : undefined}>
          <Icon name="check" size={16} strokeWidth={3} />
        </span>
      ) : undefined} />
  );

  return (
    <Sheet
      open={open} onClose={() => { reset(); onClose(); }} tall title={mode === 'search' ? (title ?? 'Add ingredient') : 'Custom ingredient'} zIndex={75}
      footer={multi && mode === 'search' ? (
        <Button variant="primary" size="lg" block disabled={selected.size === 0} onClick={() => finish()}>
          {selected.size === 0 ? 'Tick the ingredients you want' : `Add ${selected.size} ingredient${selected.size === 1 ? '' : 's'}`}
        </Button>
      ) : undefined}
    >
      <div className="sticky top-0 -mx-5 px-5 pb-2 pt-1 [background:var(--sheet)] z-10 space-y-2.5">
        {allowCustom && <Segmented value={mode} onChange={setMode} options={[{ value: 'search', label: 'Search foods' }, { value: 'custom', label: 'Create custom' }]} />}
        {mode === 'search' && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Icon name="search" size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                autoFocus value={q} onChange={e => setQ(e.target.value)} type="search" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                placeholder="Chicken breast raw, potato, olive oil…" aria-label="Search ingredients"
                className="w-full h-12 rounded-2xl bg-surface2 pl-11 pr-4 text-[17px] outline-none border border-line focus:border-accent"
              />
            </div>
            <ScanButton onClick={() => setScanning(true)} className="!h-12 !w-12" />
          </div>
        )}
      </div>
      {mode === 'search' ? (
        <>
          {hint && <Notice tone="info" className="mt-1"><span className="text-[13px]">Pick the <b>raw</b> (or as-packaged) version of ingredients — you weigh them before cooking, then enter the finished dish weight.</span></Notice>}
          {dq.trim() ? (
            results.map(row)
          ) : (
            <>
              {fridge.length > 0 && <><SectionTitle right={<span className="text-[12px] text-muted">{fridge.length}</span>}>In my fridge</SectionTitle>{fridge.map(row)}</>}
              {recent.length > 0 && <><SectionTitle>Recent</SectionTitle>{recent.map(row)}</>}
              {favs.length > 0 && <><SectionTitle>Favorites</SectionTitle>{favs.map(row)}</>}
            </>
          )}
          {dq.trim() && results.length === 0 && <p className="text-center text-muted py-6">No match. Try “Create custom”{' '}or scan the barcode.</p>}
        </>
      ) : (
        <CustomIngredient defaultName={q} onDone={f => (multi ? finish(f) : pick(f))} />
      )}
      <ScanFoodSheet
        open={scanning} onClose={() => setScanning(false)} title="Scan ingredients" continuous={multi}
        onFood={f => { if (multi) setSelected(m => new Map(m).set(f.id, f)); else pick(f); }}
      />
    </Sheet>
  );
}

function CustomIngredient({ defaultName, onDone }: { defaultName: string; onDone: (f: Food) => void }) {
  const saveFood = useAppStore(s => s.saveFood);
  const [name, setName] = useState(defaultName);
  const [basis, setBasis] = useState<NutritionBasis>('as-packaged');
  const [p, setP] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [f, setF] = useState<number | null>(null);
  const [k, setK] = useState<number | null>(null);
  const [kTouched, setKTouched] = useState(false);
  const [keep, setKeep] = useState(true);
  const calc = Math.round(atwaterKcal({ protein: p ?? 0, carbs: c ?? 0, fat: f ?? 0 }));
  const kcal = kTouched ? k : calc;
  const sum = (p ?? 0) + (c ?? 0) + (f ?? 0);
  const valid = name.trim().length > 0 && p != null && c != null && f != null && sum <= 100.5 && kcal != null;

  const submit = async () => {
    const now = Date.now();
    const food: Food = {
      id: newId('food'), name: name.trim(), category: 'custom', proteinPer100g: p ?? 0, carbsPer100g: c ?? 0, fatPer100g: f ?? 0,
      caloriesPer100g: kcal ?? 0, isLiquid: false, nutritionBasis: basis, source: 'custom', createdAt: now, updatedAt: now,
    };
    if (keep) await saveFood(food);
    else useAppStore.setState(s => ({ foodMap: new Map(s.foodMap).set(food.id, food) }));
    onDone(food);
  };

  return (
    <div className="space-y-4 pt-2">
      <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Homemade sauce" /></Field>
      <Segmented value={basis} onChange={setBasis} options={[{ value: 'raw', label: 'Raw' }, { value: 'as-packaged', label: 'As packaged' }, { value: 'cooked', label: 'Cooked' }]} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={<span className="text-protein">Protein / 100 g</span>}><NumInput value={p} onChange={setP} suffix="g" placeholder="0" /></Field>
        <Field label={<span className="text-carbs">Carbs / 100 g</span>}><NumInput value={c} onChange={setC} suffix="g" placeholder="0" /></Field>
        <Field label={<span className="text-fat">Fat / 100 g</span>}><NumInput value={f} onChange={setF} suffix="g" placeholder="0" /></Field>
        <Field label={<span className="text-kcal">Calories / 100 g</span>}><NumInput value={kcal} onChange={v => { setK(v); setKTouched(true); }} suffix="kcal" placeholder="0" /></Field>
      </div>
      {sum > 100.5 && <Notice tone="error">Protein + carbs + fat can’t exceed 100 g per 100 g.</Notice>}
      <label className="flex items-center justify-between rounded-2xl bg-surface2 px-4 h-14">
        <span>Save to my foods</span>
        <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} className="h-6 w-6 accent-[var(--accent)]" />
      </label>
      <Button variant="primary" size="lg" block disabled={!valid} onClick={submit}>Add ingredient</Button>
    </div>
  );
}
