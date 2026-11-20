import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, TextInput } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { Chip } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { buildManualLogEntry } from '../../lib/logging';
import { MEAL_TYPES, type MealType } from '../../types';
import { defaultMealForNow } from '../../utils/dates';
import { MEAL_LABEL } from '../foods/LogFoodSheet';

export function QuickAddSheet() {
  const open = useUI(s => s.quickAddOpen);
  if (!open) return null;
  return <Inner />;
}

function Inner() {
  const addLog = useAppStore(s => s.addLog);
  const date = useAppStore(s => s.selectedDate);
  const showToast = useAppStore(s => s.showToast);
  const close = () => useUI.setState({ quickAddOpen: false });
  const [name, setName] = useState('');
  const [kcal, setKcal] = useState<number | null>(null);
  const [p, setP] = useState<number | null>(null);
  const [c, setC] = useState<number | null>(null);
  const [f, setF] = useState<number | null>(null);
  const [meal, setMeal] = useState<MealType>(defaultMealForNow());
  const ok = (kcal ?? 0) > 0 || (p ?? 0) > 0;
  const calcKcal = (p ?? 0) * 4 + (c ?? 0) * 4 + (f ?? 0) * 9;

  return (
    <Sheet open onClose={close} title="Quick add" footer={
      <Button variant="primary" size="lg" block disabled={!ok} onClick={async () => {
        await addLog(buildManualLogEntry({ date, mealType: meal, name: name.trim() || 'Quick add', macros: { protein: p ?? 0, carbs: c ?? 0, fat: f ?? 0, calories: kcal ?? calcKcal, fiber: 0 } }));
        showToast('Added', { tone: 'success' }); close();
      }}>Add to {MEAL_LABEL[meal].toLowerCase()}</Button>
    }>
      <div className="space-y-4 pt-1">
        <p className="text-[14px] text-muted">For restaurant meals or anything you only know the totals of.</p>
        <Field label="Name (optional)"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Lunch out" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={<span style={{ color: 'var(--protein)' }}>Protein</span>}><NumInput value={p} onChange={setP} suffix="g" placeholder="0" /></Field>
          <Field label={<span style={{ color: 'var(--calories)' }}>Calories</span>}><NumInput value={kcal} onChange={setKcal} suffix="kcal" placeholder={calcKcal ? String(Math.round(calcKcal)) : '0'} /></Field>
          <Field label={<span style={{ color: 'var(--carbs)' }}>Carbs</span>}><NumInput value={c} onChange={setC} suffix="g" placeholder="0" /></Field>
          <Field label={<span style={{ color: 'var(--fat)' }}>Fat</span>}><NumInput value={f} onChange={setF} suffix="g" placeholder="0" /></Field>
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5">
          {MEAL_TYPES.map(m => <Chip key={m} active={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>)}
        </div>
      </div>
    </Sheet>
  );
}
