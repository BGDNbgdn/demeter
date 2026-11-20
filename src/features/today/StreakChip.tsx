import { useMemo } from 'react';
import { Icon } from '../../components/ui/Icon';
import { useAppStore } from '../../hooks/useAppStore';
import { fmtNum } from '../../lib/engine';
import { computeStreaks } from '../../lib/streak';
import { todayStr } from '../../utils/dates';

/** Streak of days with protein ≥ 75% of the goal. */
export function StreakChip() {
  const logs = useAppStore(s => s.logs);
  const target = useAppStore(s => s.targets.protein);
  const date = useAppStore(s => s.selectedDate);
  const st = useMemo(() => computeStreaks(logs, target), [logs, target]);
  if (!(target > 0) || date !== todayStr()) return null;
  const need = target * st.threshold;

  let text: string; let sub: string; let active = st.current > 0;
  if (st.current > 0) {
    text = `${st.current}-day streak`;
    sub = st.todayMet ? 'today counted ✓' : `${fmtNum(st.proteinToGoToday, 0)} g more today keeps it`;
  } else {
    active = false;
    text = 'No streak yet';
    sub = `reach ${fmtNum(need, 0)} g protein today to start`;
  }
  return (
    <div className="mt-3 flex items-center gap-3 rounded-2xl bg-surface border border-line/70 px-4 py-2.5" data-testid="streak-chip">
      <span className={`h-9 w-9 rounded-full flex items-center justify-center ${active ? 'bg-accentsoft text-accent' : 'bg-surface2 text-muted'}`}><Icon name="flame" size={20} filled={active && st.todayMet} /></span>
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold leading-tight">{text}</div>
        <div className="text-[12px] text-muted truncate">{sub}</div>
      </div>
      {st.best > 0 && <div className="text-right text-[11px] text-muted leading-tight">best<br /><b className="text-ink text-[14px]">{st.best}</b></div>}
    </div>
  );
}
