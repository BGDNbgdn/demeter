import { useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../components/ui/Icon';
import { IconButton } from '../../components/ui/Button';
import { Card, EmptyState, MacroLine, PageHeader, ProgressBar, SectionTitle } from '../../components/ui/misc';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtKcal, fmtNum } from '../../lib/engine';
import { totalsOf } from '../../lib/logging';
import { MEAL_TYPES, type Food, type MealLogEntry, type Recipe } from '../../types';
import { addDays, defaultMealForNow, formatDayLabel, parseDateStr, todayStr } from '../../utils/dates';
import { MEAL_LABEL } from '../foods/LogFoodSheet';
import { cn } from '../../utils/cn';
import { BackupReminder } from '../settings/BackupReminder';
import { SyncAlert } from '../settings/SyncAlert';
import { StreakChip } from './StreakChip';

export function TodayPage() {
  const date = useAppStore(s => s.selectedDate);
  const setDate = useAppStore(s => s.setSelectedDate);
  const logs = useAppStore(s => s.logs);
  const targets = useAppStore(s => s.targets);
  const dateInput = useRef<HTMLInputElement>(null);

  // If the app stays open past midnight while showing "today", roll over to the new day.
  useEffect(() => {
    let last = todayStr();
    const onVis = () => {
      const now = todayStr();
      if (document.visibilityState === 'visible' && now !== last) {
        if (useAppStore.getState().selectedDate === last) setDate(now);
        last = now;
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [setDate]);

  const dayLogs = useMemo(() => logs.filter(l => l.date === date).sort((a, b) => a.createdAt - b.createdAt), [logs, date]);
  const totals = useMemo(() => totalsOf(dayLogs), [dayLogs]);
  const isToday = date === todayStr();
  const proteinLeft = targets.protein - totals.protein;
  const kcalLeft = targets.calories - totals.calories;

  return (
    <>
      <PageHeader
        title={formatDayLabel(date)}
        subtitle={parseDateStr(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        left={<IconButton icon="chevL" label="Previous day" onClick={() => setDate(addDays(date, -1))} />}
        right={
          <>
            {!isToday && <button onClick={() => setDate(todayStr())} className="h-9 px-3 rounded-full bg-accentsoft text-accent text-[14px] font-semibold mr-1">Today</button>}
            <IconButton icon="chevR" label="Next day" onClick={() => setDate(addDays(date, 1))} />
            <IconButton icon="today" label="Pick a date" onClick={() => { try { dateInput.current?.showPicker?.(); } catch { dateInput.current?.click(); } }} />
            <input ref={dateInput} type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="sr-only" tabIndex={-1} aria-hidden />
            <IconButton icon="search" label="Search" onClick={() => useUI.setState({ searchOpen: true })} />
          </>
        }
      />
      <main className="px-4 pb-6 max-w-xl mx-auto">
        <SyncAlert />
        <BackupReminder />

        {/* ---- progress card */}
        <Card className="mt-3 !p-5">
          <div className="grid grid-cols-2 gap-5">
            <div>
              <div className="text-[12px] uppercase tracking-wider font-semibold text-muted">Protein</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[44px] leading-none font-bold tabular text-protein" data-testid="protein-total">{fmtNum(totals.protein, 0)}</span>
                <span className="text-[15px] text-muted tabular">/ {fmtNum(targets.protein, 0)} g</span>
              </div>
              <ProgressBar value={totals.protein} target={targets.protein} color="var(--protein)" height={10} className="mt-3" />
              <div className="text-[13px] mt-2 tabular" style={{ color: proteinLeft >= 0 ? 'var(--muted)' : 'var(--ok)' }}>
                {proteinLeft >= 0 ? `${fmtNum(proteinLeft, 0)} g to go` : `Target reached · +${fmtNum(-proteinLeft, 0)} g`}
              </div>
            </div>
            <div>
              <div className="text-[12px] uppercase tracking-wider font-semibold text-muted">Calories</div>
              <div className="flex items-baseline gap-1 mt-0.5">
                <span className="text-[32px] leading-[44px] font-bold tabular text-kcal" data-testid="kcal-total">{fmtKcal(totals.calories)}</span>
                <span className="text-[15px] text-muted tabular">/ {fmtNum(targets.calories, 0)}</span>
              </div>
              <ProgressBar value={totals.calories} target={targets.calories} color="var(--calories)" height={10} className="mt-3" />
              <div className="text-[13px] mt-2 tabular" style={{ color: kcalLeft >= 0 ? 'var(--muted)' : 'var(--danger)' }}>
                {kcalLeft >= 0 ? `${fmtNum(kcalLeft, 0)} kcal left` : `${fmtNum(-kcalLeft, 0)} kcal over`}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-line/70">
            {[
              { label: 'Carbs', v: totals.carbs, t: targets.carbs, c: 'var(--carbs)' },
              { label: 'Fat', v: totals.fat, t: targets.fat, c: 'var(--fat)' },
              { label: 'Fibre', v: totals.fiber, t: targets.fiber ?? 0, c: 'var(--fiber)' },
            ].map(x => (
              <div key={x.label}>
                <div className="text-[12px] text-muted">{x.label}</div>
                <div className="tabular whitespace-nowrap"><b className="text-[16px]">{fmtNum(x.v, 0)}</b><span className="text-[12px] text-muted">{x.t ? ` / ${fmtNum(x.t, 0)}` : ''} g</span></div>
                <ProgressBar value={x.v} target={x.t || 1} color={x.c} height={5} className="mt-1.5" />
              </div>
            ))}
          </div>
        </Card>

        <StreakChip />

        <QuickAddRow />

        {/* ---- meals */}
        {dayLogs.length === 0 ? (
          <EmptyState icon="foods" title={isToday ? 'Nothing logged yet' : 'Nothing logged this day'} body="Tap the + button to add a food, a recipe portion, or quick macros." />
        ) : (
          MEAL_TYPES.map(meal => {
            const list = dayLogs.filter(l => l.mealType === meal);
            if (!list.length) return null;
            const t = totalsOf(list);
            return (
              <section key={meal}>
                <SectionTitle right={<span className="text-[13px] text-muted tabular"><b className="text-protein">{fmtNum(t.protein, 0)}</b> g P · {fmtKcal(t.calories)} kcal</span>}>{MEAL_LABEL[meal]}</SectionTitle>
                <Card className="!p-0 overflow-hidden">
                  {list.map(e => <EntryRow key={e.id} e={e} />)}
                </Card>
              </section>
            );
          })
        )}
      </main>
      <AddFab />
    </>
  );
}

function EntryRow({ e }: { e: MealLogEntry }) {
  return (
    <button type="button" onClick={() => useUI.setState({ editEntryId: e.id })} className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line/60 last:border-b-0 active:bg-surface2">
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-medium truncate">{e.name}</div>
        <div className="text-[13px] text-muted tabular">{e.consumedWeightG > 0 ? `${fmtNum(e.consumedWeightG, 1)} g · ` : ''}{fmtKcal(e.calories)} kcal{e.cooking ? ' · converted from raw' : ''}</div>
      </div>
      <div className="text-right">
        <div className="text-[19px] font-bold text-protein tabular leading-none">{fmtNum(e.protein, 1)}<span className="text-[11px] ml-0.5">g</span></div>
        <div className="text-[10px] uppercase tracking-wider text-muted mt-0.5">protein</div>
      </div>
    </button>
  );
}

/** Quick-add chips: frequent foods & recipes (one tap opens the log sheet pre-filled with the last amount). */
function QuickAddRow() {
  const usage = useAppStore(s => s.usage);
  const foodMap = useAppStore(s => s.foodMap);
  const recipes = useAppStore(s => s.recipes);
  const favIds = useAppStore(s => s.settings.favoriteFoodIds);
  const items = useMemo(() => {
    const out: Array<{ key: string; label: string; onClick: () => void; protein: number }> = [];
    const seen = new Set<string>();
    const sorted = Object.values(usage).sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt);
    for (const u of sorted) {
      if (out.length >= 10) break;
      if (u.key.startsWith('recipe:')) {
        const r: Recipe | undefined = recipes.find(x => `recipe:${x.id}` === u.key);
        if (r) { seen.add(u.key); out.push({ key: u.key, label: r.name, protein: 0, onClick: () => useUI.setState({ logRecipe: { recipeId: r.id } }) }); }
      } else {
        const f: Food | undefined = foodMap.get(u.key);
        if (f) { seen.add(u.key); out.push({ key: u.key, label: f.name.split(',')[0], protein: 0, onClick: () => useUI.setState({ logFood: { foodId: f.id } }) }); }
      }
    }
    for (const id of favIds) {
      const f = foodMap.get(id);
      if (f && !seen.has(id) && out.length < 12) out.push({ key: id, label: f.name.split(',')[0], protein: 0, onClick: () => useUI.setState({ logFood: { foodId: id } }) });
    }
    return out;
  }, [usage, foodMap, recipes, favIds]);
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
        {items.map(i => (
          <button key={i.key} type="button" onClick={i.onClick} className="shrink-0 h-11 px-4 rounded-full bg-surface border border-line text-[15px] font-medium active:bg-surface2 flex items-center gap-1.5 max-w-[190px]">
            <Icon name="plus" size={16} className="text-accent shrink-0" /><span className="truncate">{i.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function AddFab({ className }: { className?: string }) {
  return (
    <button
      type="button" aria-label="Add food"
      onClick={() => { useUI.setState({ addMenuOpen: true }); void defaultMealForNow; }}
      className={cn('fixed right-4 z-30 h-16 w-16 rounded-full bg-accent text-accentink shadow-xl flex items-center justify-center active:scale-95 transition-transform', className)}
      style={{ bottom: 'calc(78px + env(safe-area-inset-bottom))' }}
    >
      <Icon name="plus" size={30} strokeWidth={2.4} />
    </button>
  );
}

export { MacroLine };
