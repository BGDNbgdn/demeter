import { useEffect, useMemo, useRef } from 'react';
import { Icon } from '../../components/ui/Icon';
import { IconButton } from '../../components/ui/Button';
import { EmptyState, MacroLine, PageHeader, ProgressBar } from '../../components/ui/misc';
import { SwipeRow } from '../../components/ui/SwipeRow';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtKcal, fmtNum } from '../../lib/engine';
import { totalsOf } from '../../lib/logging';
import { computeStreaks } from '../../lib/streak';
import { MEAL_TYPES, type Food, type MealLogEntry, type Recipe } from '../../types';
import { addDays, dateRange, formatDayLabel, parseDateStr, startOfWeek, todayStr } from '../../utils/dates';
import { MEAL_LABEL } from '../foods/LogFoodSheet';
import { cn } from '../../utils/cn';
import { BackupReminder } from '../settings/BackupReminder';
import { SyncAlert } from '../settings/SyncAlert';

const RING_R = 40;
const RING_C = 2 * Math.PI * RING_R;
const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

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
  const loggedDates = useMemo(() => new Set(logs.map(l => l.date)), [logs]);
  const totals = useMemo(() => totalsOf(dayLogs), [dayLogs]);
  const streak = useMemo(() => computeStreaks(logs, targets.protein), [logs, targets.protein]);
  const isToday = date === todayStr();
  const kcalLeft = targets.calories - totals.calories;
  const kcalPct = targets.calories > 0 ? Math.min(1, totals.calories / targets.calories) : 0;
  const openPicker = () => { try { dateInput.current?.showPicker?.(); } catch { dateInput.current?.click(); } };

  return (
    <>
      <PageHeader
        title={formatDayLabel(date)}
        subtitle={
          <button type="button" onClick={openPicker} className="text-left active:opacity-60" aria-label="Pick a date">
            {parseDateStr(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </button>
        }
        right={
          <>
            {isToday ? (
              targets.protein > 0 && (
                <span className="glass h-10 pl-3 pr-3.5 rounded-full flex items-center gap-1.5 font-bold text-[16px]" aria-label={`Streak: ${streak.current} days`} data-testid="streak-pill">
                  <Icon name="flame" size={18} className="text-[var(--carbs)]" filled={streak.todayMet} /><b>{streak.current}</b>
                </span>
              )
            ) : (
              <button type="button" onClick={() => setDate(todayStr())} className="glass-btn h-10 px-4 rounded-full text-[14px] font-bold">Today</button>
            )}
            <IconButton icon="search" label="Search" tone="glass" onClick={() => useUI.setState({ searchOpen: true })} />
          </>
        }
      />
      <input ref={dateInput} type="date" value={date} onChange={e => e.target.value && setDate(e.target.value)} className="sr-only" tabIndex={-1} aria-hidden />

      <main className="px-4 pb-6 max-w-xl mx-auto">
        <SyncAlert />
        <BackupReminder />

        <WeekStrip date={date} setDate={setDate} loggedDates={loggedDates} />

        {/* ---- calories */}
        <section className="glass rounded-[28px] px-[18px] py-3.5 mt-2.5" aria-label="Calories">
          <p className="text-[14px] text-muted font-medium">{kcalLeft >= 0 ? 'Calories left' : 'Calories over'}</p>
          <div className="flex items-center justify-between mt-1">
            <div className="min-w-0">
              <p className="text-[48px] leading-[1.05] font-semibold tracking-[-0.03em] tabular" data-testid="kcal-left">
                {fmtKcal(Math.abs(kcalLeft))}<small className="text-[18px] font-medium text-muted ml-1.5 tracking-normal">kcal</small>
              </p>
              <p className="text-[13px] text-muted mt-0.5 tabular"><span data-testid="kcal-total">{fmtKcal(totals.calories)}</span> eaten · Goal {fmtNum(targets.calories, 0)} kcal</p>
            </div>
            <div className="relative h-[92px] w-[92px] shrink-0">
              <svg viewBox="0 0 92 92" className="block h-[92px] w-[92px]" aria-hidden>
                <defs>
                  <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#7ee8d6" /><stop offset=".5" stopColor="#f9b38e" /><stop offset="1" stopColor="#b69bff" />
                  </linearGradient>
                </defs>
                <circle cx="46" cy="46" r={RING_R} fill="none" stroke="var(--surface-3)" strokeWidth="10" />
                <circle
                  cx="46" cy="46" r={RING_R} fill="none" strokeWidth="10" strokeLinecap="round"
                  stroke={kcalLeft < 0 ? 'var(--danger)' : 'url(#ring-grad)'}
                  strokeDasharray={`${RING_C * kcalPct} ${RING_C * (1 - kcalPct)}`} transform="rotate(-90 46 46)"
                />
              </svg>
              <button
                type="button" aria-label="Add food" onClick={() => useUI.setState({ addMenuOpen: true })}
                className="pill-on absolute left-1/2 top-1/2 -ml-[27px] -mt-[27px] h-[54px] w-[54px] rounded-full flex items-center justify-center active:scale-95 transition-transform"
              >
                <Icon name="plus" size={26} strokeWidth={2.5} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-2.5">
            {[
              { label: 'Carbs', v: totals.carbs, t: targets.carbs, c: 'var(--carbs)' },
              { label: 'Fat', v: totals.fat, t: targets.fat, c: 'var(--fat)' },
              { label: 'Fibre', v: totals.fiber, t: targets.fiber ?? 0, c: 'var(--fiber)' },
            ].map(x => (
              <div key={x.label}>
                <div className="text-[13px] text-muted">{x.label}</div>
                <ProgressBar value={x.v} target={x.t || 1} color={x.c} height={4} className="mt-[7px] mb-1.5" />
                <div className="text-[13px] text-muted tabular whitespace-nowrap"><b className="text-ink text-[15px]">{fmtNum(x.v, 0)}</b>{x.t ? ` / ${fmtNum(x.t, 0)}` : ''} g</div>
              </div>
            ))}
          </div>
        </section>

        <ProteinHero protein={totals.protein} goal={targets.protein} isToday={isToday} streak={streak} />

        <QuickAddRow />

        {/* ---- meals: every meal shows all of its macros */}
        {dayLogs.length === 0 ? (
          <EmptyState icon="foods" title={isToday ? 'Nothing logged yet' : 'Nothing logged this day'} body="Tap the + in the ring to add a food, a recipe portion, or quick macros." />
        ) : (
          MEAL_TYPES.map(meal => {
            const list = dayLogs.filter(l => l.mealType === meal);
            if (!list.length) return null;
            const t = totalsOf(list);
            return (
              <section key={meal} className="mt-5" aria-label={MEAL_LABEL[meal]}>
                <div className="flex items-baseline justify-between gap-3 px-1.5 pb-2">
                  <h3 className="text-[18px] font-bold tracking-[-0.01em]">{MEAL_LABEL[meal]}</h3>
                  <MacroLine m={t} className="justify-end" />
                </div>
                <div className="space-y-2.5">{list.map(e => <EntryRow key={e.id} e={e} />)}</div>
              </section>
            );
          })
        )}
      </main>
    </>
  );
}

/** The week of the selected day: tap a day, or swipe sideways to change week. A dot marks days with food logged. */
function WeekStrip({ date, setDate, loggedDates }: { date: string; setDate: (d: string) => void; loggedDates: Set<string> }) {
  const today = todayStr();
  const days = dateRange(startOfWeek(date), addDays(startOfWeek(date), 6));
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <section
      className="glass grid grid-cols-7 p-[7px] rounded-[30px] touch-pan-y" aria-label="Week" data-no-swipe
      onTouchStart={e => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => {
        const s = start.current; start.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x; const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) setDate(addDays(date, dx < 0 ? 7 : -7));
      }}
    >
      {days.map((d, i) => {
        const sel = d === date; const has = loggedDates.has(d);
        const label = parseDateStr(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        return (
          <button
            key={d} type="button" onClick={() => setDate(d)} aria-pressed={sel} aria-label={`${label}${has ? ', food logged' : ', nothing logged'}`}
            className={cn('h-[66px] rounded-[22px] flex flex-col items-center justify-center gap-[5px] transition-colors', sel ? 'pill-on' : 'text-muted active:bg-surface2')}
          >
            <small className="text-[12px] font-semibold">{DAY_INITIALS[i]}</small>
            <b className={cn('text-[17px] font-bold tabular', !sel && (d === today ? 'text-accent' : 'text-ink'))}>{parseDateStr(d).getDate()}</b>
            <i className="block h-1.5 w-1.5 rounded-full" style={{ background: has ? (sel ? '#f9b38e' : 'var(--protein)') : 'transparent' }} />
          </button>
        );
      })}
    </section>
  );
}

/** The protein card: the number that matters, five segments, and what the streak needs. */
function ProteinHero({ protein, goal, isToday, streak }: { protein: number; goal: number; isToday: boolean; streak: ReturnType<typeof computeStreaks> }) {
  const left = goal - protein;
  const pct = goal > 0 ? Math.round((protein / goal) * 100) : 0;
  const seg = goal / 5;
  let streakNote: string | null = null;
  if (isToday && goal > 0) {
    if (streak.todayMet) streakNote = streak.current > 1 ? `${streak.current}-day streak ✓` : 'Streak day ✓';
    else if (streak.current > 0) streakNote = `${fmtNum(streak.proteinToGoToday, 0)} g keeps your ${streak.current}-day streak`;
    else streakNote = `Reach ${fmtNum(goal * streak.threshold, 0)} g to start a streak`;
  }
  return (
    <section className="bg-grad relative mt-2.5 rounded-[30px] px-[18px] py-3.5 overflow-hidden" aria-label="Protein">
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(110% 70% at 10% -20%, rgba(255,255,255,.4), transparent 60%)' }} />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="font-dot text-[18px] font-bold">PROTEIN</span>
          <span className="text-[13px] font-semibold">Goal {fmtNum(goal, 0)} g</span>
        </div>
        <div className="flex items-center justify-between mt-1">
          <p className="font-dot text-[60px] leading-[.95] tabular-nums" data-testid="protein-total">
            {fmtNum(protein, 0)}<small className="font-sans text-[22px] font-bold tracking-normal ml-1.5">g</small>
          </p>
          <span className="bg-[#1a1030] text-white font-bold text-[15px] px-4 py-2 rounded-full tabular">{pct}%</span>
        </div>
        <div className="flex gap-1.5 mt-3" role="img" aria-label={`${fmtNum(protein, 0)} of ${fmtNum(goal, 0)} grams of protein`}>
          {[0, 1, 2, 3, 4].map(i => {
            const f = seg > 0 ? Math.max(0, Math.min(1, (protein - i * seg) / seg)) : 0;
            return <i key={i} className="block flex-1 h-2.5 rounded-md overflow-hidden" style={{ background: 'rgba(26,16,48,.2)' }}><b className="block h-full rounded-md" style={{ width: `${f * 100}%`, background: '#1a1030' }} /></i>;
          })}
        </div>
        <div className="flex justify-between text-[12px] font-semibold mt-1.5 tabular"><span>0</span><span>{fmtNum(goal, 0)} g</span></div>
        <p className="flex justify-between items-center gap-2 text-[13px] font-semibold mt-2">
          <span className="tabular">{left >= 0 ? `${fmtNum(left, 0)} g to go` : `Target reached · +${fmtNum(-left, 0)} g`}</span>
          {streakNote && <span className="flex items-center gap-1 text-right"><Icon name="flame" size={15} className="shrink-0" />{streakNote}</span>}
        </p>
      </div>
    </section>
  );
}

function EntryRow({ e }: { e: MealLogEntry }) {
  const deleteLog = useAppStore(s => s.deleteLog);
  const restoreLog = useAppStore(s => s.restoreLog);
  const showToast = useAppStore(s => s.showToast);
  const small = [
    e.portions ? `${fmtNum(e.portions, 2)} portion${e.portions === 1 ? '' : 's'}` : null,
    e.consumedWeightG > 0 ? `${fmtNum(e.consumedWeightG, 1)} g` : null,
    `${fmtKcal(e.calories)} kcal`,
    e.cooking ? 'converted from raw' : null,
  ].filter(Boolean).join(' · ');
  return (
    <SwipeRow actionLabel="Delete" onAction={async () => { await deleteLog(e.id); showToast('Entry deleted', { actionLabel: 'Undo', onAction: () => void restoreLog(e.id) }); }}>
    <button type="button" onClick={() => useUI.setState({ editEntryId: e.id })} className="glass w-full flex items-center gap-3 rounded-[26px] py-2.5 pl-2.5 pr-4 text-left active:opacity-80">
      <span className="bg-grad h-[52px] w-[52px] shrink-0 rounded-[18px] flex items-center justify-center" style={{ boxShadow: 'none' }}>
        <Icon name={e.recipeId ? 'recipes' : 'foods'} size={24} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-semibold leading-tight truncate">{e.name}</div>
        <div className="text-[13px] text-muted tabular mt-0.5 truncate">{small}</div>
        <div className="text-[12.5px] text-muted tabular mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis">
          <b className="text-carbs font-semibold">{fmtNum(e.carbs, 1)}</b> C · <b className="text-fat font-semibold">{fmtNum(e.fat, 1)}</b> F
          {e.fiber > 0 && <> · <b className="text-fiber font-semibold">{fmtNum(e.fiber, 1)}</b> fibre</>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <b className="block text-[24px] font-bold leading-none tabular">{fmtNum(e.protein, 1)}</b>
        <span className="text-[12px] text-muted">g protein</span>
      </div>
    </button>
    </SwipeRow>
  );
}

/** Quick-add chips: frequent foods & recipes (one tap opens the log sheet pre-filled with the last amount). */
function QuickAddRow() {
  const usage = useAppStore(s => s.usage);
  const foodMap = useAppStore(s => s.foodMap);
  const recipes = useAppStore(s => s.recipes);
  const favIds = useAppStore(s => s.settings.favoriteFoodIds);
  const items = useMemo(() => {
    const out: Array<{ key: string; label: string; onClick: () => void }> = [];
    const seen = new Set<string>();
    const sorted = Object.values(usage).sort((a, b) => b.count - a.count || b.lastUsedAt - a.lastUsedAt);
    for (const u of sorted) {
      if (out.length >= 10) break;
      if (u.key.startsWith('recipe:')) {
        const r: Recipe | undefined = recipes.find(x => `recipe:${x.id}` === u.key);
        if (r) { seen.add(u.key); out.push({ key: u.key, label: r.name, onClick: () => useUI.setState({ logRecipe: { recipeId: r.id } }) }); }
      } else {
        const f: Food | undefined = foodMap.get(u.key);
        if (f) { seen.add(u.key); out.push({ key: u.key, label: f.name.split(',')[0], onClick: () => useUI.setState({ logFood: { foodId: f.id } }) }); }
      }
    }
    for (const id of favIds) {
      const f = foodMap.get(id);
      if (f && !seen.has(id) && out.length < 12) out.push({ key: id, label: f.name.split(',')[0], onClick: () => useUI.setState({ logFood: { foodId: id } }) });
    }
    return out;
  }, [usage, foodMap, recipes, favIds]);
  if (!items.length) return null;
  return (
    <div className="mt-2.5">
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4">
        {items.map(i => (
          <button key={i.key} type="button" onClick={i.onClick} className="glass shrink-0 h-12 px-5 rounded-full text-[16px] font-bold active:opacity-70 flex items-center gap-2 max-w-[210px]">
            <Icon name="plus" size={18} strokeWidth={2.5} className="shrink-0" /><span className="truncate">{i.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export { MacroLine };
