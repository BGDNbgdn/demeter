import { useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, MacroGrid, Notice, TextInput } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { Chip, WeightInput } from '../../components/ui/WeightInput';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtNum } from '../../lib/engine';
import { MEAL_TYPES, type MealLogEntry, type MealType } from '../../types';
import { MEAL_LABEL } from '../foods/LogFoodSheet';

export function EntryEditSheet() {
  const id = useUI(s => s.editEntryId);
  const entry = useAppStore(s => s.logs.find(l => l.id === id));
  if (!id || !entry) return null;
  return <Inner key={id} entry={entry} />;
}

function Inner({ entry }: { entry: MealLogEntry }) {
  const updateLog = useAppStore(s => s.updateLog);
  const deleteLog = useAppStore(s => s.deleteLog);
  const addLog = useAppStore(s => s.addLog);
  const showToast = useAppStore(s => s.showToast);
  const close = () => useUI.setState({ editEntryId: null });
  const scalable = entry.consumedWeightG > 0;
  const [weight, setWeight] = useState<number | null>(entry.consumedWeightG || null);
  const [meal, setMeal] = useState<MealType>(entry.mealType);
  const [date, setDate] = useState(entry.date);
  const [notes, setNotes] = useState(entry.notes ?? '');
  const [name, setName] = useState(entry.name);
  const [man, setMan] = useState({ p: entry.protein, c: entry.carbs, f: entry.fat, k: entry.calories });

  const factor = scalable && weight ? weight / entry.consumedWeightG : 0;
  const macros = scalable
    ? { protein: entry.protein * factor, carbs: entry.carbs * factor, fat: entry.fat * factor, calories: entry.calories * factor, fiber: entry.fiber * factor }
    : { protein: man.p, carbs: man.c, fat: man.f, calories: man.k, fiber: 0 };

  const save = async () => {
    await updateLog({ ...entry, name: name.trim() || entry.name, mealType: meal, date, notes: notes.trim() || undefined, consumedWeightG: scalable ? (weight ?? entry.consumedWeightG) : 0, ...macros });
    showToast('Entry updated', { tone: 'success' });
    close();
  };
  const remove = async () => {
    const copy = entry;
    await deleteLog(entry.id);
    close();
    showToast('Entry deleted', { actionLabel: 'Undo', onAction: () => void addLog(copy) });
  };

  return (
    <Sheet open onClose={close} title="Edit entry" footer={
      <div className="flex gap-2">
        <Button variant="danger" size="lg" icon="trash" aria-label="Delete entry" onClick={remove} />
        <Button variant="primary" size="lg" block disabled={scalable && !weight} onClick={save}>Save</Button>
      </div>
    }>
      <div className="space-y-4 pt-1">
        {!entry.foodId && !entry.recipeId ? <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} /></Field> : <div className="text-[17px] font-semibold px-1">{entry.name}</div>}
        {entry.cooking && (
          <Notice tone="info">
            Converted from a batch of <b>{fmtNum(entry.cooking.rawWeightG, 0)} g raw → {fmtNum(entry.cooking.cookedWeightG, 0)} g cooked</b>{entry.cooking.estimated ? ' (raw weight estimated from typical yield)' : ''}.
          </Notice>
        )}
        {scalable ? (
          <div>
            <div className="text-[13px] font-medium text-muted mb-1.5 px-1">Amount eaten</div>
            <WeightInput value={weight} onChange={setWeight} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Protein"><NumInput value={man.p} onChange={v => setMan({ ...man, p: v ?? 0 })} suffix="g" /></Field>
            <Field label="Calories"><NumInput value={man.k} onChange={v => setMan({ ...man, k: v ?? 0 })} suffix="kcal" /></Field>
            <Field label="Carbs"><NumInput value={man.c} onChange={v => setMan({ ...man, c: v ?? 0 })} suffix="g" /></Field>
            <Field label="Fat"><NumInput value={man.f} onChange={v => setMan({ ...man, f: v ?? 0 })} suffix="g" /></Field>
          </div>
        )}
        <MacroGrid m={macros} big />
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5">
          {MEAL_TYPES.map(m => <Chip key={m} active={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>)}
        </div>
        <Field label="Date"><input type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="w-full h-12 rounded-2xl bg-surface2 px-4 text-[17px] outline-none" /></Field>
        <Field label="Notes (optional)"><TextInput value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. restaurant, extra sauce" /></Field>
      </div>
    </Sheet>
  );
}
