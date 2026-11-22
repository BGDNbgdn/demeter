import { IconButton } from '../../components/ui/Button';
import { addDays, formatShort, todayStr } from '../../utils/dates';
import { weekStart } from '../../lib/kitchen';
import { useWeek } from './useWeek';

export function weekLabel(week: string): string {
  const cur = weekStart(todayStr());
  const rel = week === cur ? 'This week' : week === addDays(cur, 7) ? 'Next week' : week === addDays(cur, -7) ? 'Last week' : null;
  return rel ?? `Week of ${formatShort(week)}`;
}

export function WeekNav() {
  const week = useWeek(s => s.week);
  const setWeek = useWeek(s => s.setWeek);
  return (
    <div className="glass flex items-center gap-1 rounded-full px-1.5 py-1">
      <IconButton icon="chevL" label="Previous week" onClick={() => setWeek(addDays(week, -7))} />
      <button type="button" className="flex-1 text-center active:opacity-60" onClick={() => setWeek(weekStart(todayStr()))} aria-label="Jump to this week">
        <div className="text-[16px] font-semibold leading-tight">{weekLabel(week)}</div>
        <div className="text-[12px] text-muted">{formatShort(week)} – {formatShort(addDays(week, 6))}</div>
      </button>
      <IconButton icon="chevR" label="Next week" onClick={() => setWeek(addDays(week, 7))} />
    </div>
  );
}
