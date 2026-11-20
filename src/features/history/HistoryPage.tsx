import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IconButton } from '../../components/ui/Button';
import { Card, EmptyState, PageHeader, ProgressBar, Segmented } from '../../components/ui/misc';
import { useAppStore } from '../../hooks/useAppStore';
import { useThemeColors } from '../../hooks/useThemeColors';
import { fmtKcal, fmtNum } from '../../lib/engine';
import { dailyTotals } from '../../lib/logging';
import { addDays, dateRange, endOfMonth, formatDayLabel, formatShort, monthTitle, parseDateStr, startOfMonth, startOfWeek, todayStr, weekdayShort } from '../../utils/dates';

export default function HistoryPage() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(todayStr());
  const logs = useAppStore(s => s.logs);
  const targets = useAppStore(s => s.targets);
  const setSelectedDate = useAppStore(s => s.setSelectedDate);
  const navigate = useNavigate();
  const colors = useThemeColors();

  const { from, to, title } = useMemo(() => {
    if (view === 'week') { const f = startOfWeek(anchor); const t = addDays(f, 6); return { from: f, to: t, title: `${formatShort(f)} – ${formatShort(t)}` }; }
    return { from: startOfMonth(anchor), to: endOfMonth(anchor), title: monthTitle(anchor) };
  }, [view, anchor]);
  const dates = useMemo(() => dateRange(from, to), [from, to]);
  const days = useMemo(() => dailyTotals(logs, dates), [logs, dates]);
  const logged = days.filter(d => d.count > 0);
  const avg = (k: 'protein' | 'calories' | 'carbs' | 'fat') => (logged.length ? logged.reduce((s, d) => s + d[k], 0) / logged.length : 0);
  const hitDays = logged.filter(d => d.protein >= targets.protein * 0.9).length;
  const today = todayStr();
  const step = (dir: 1 | -1) => setAnchor(a => (view === 'week' ? addDays(a, 7 * dir) : addDays(startOfMonth(a), dir > 0 ? 32 : -1)));

  const chartData = days.map(d => ({ date: d.date, label: view === 'week' ? weekdayShort(d.date) : String(parseDateStr(d.date).getDate()), protein: Math.round(d.protein * 10) / 10, calories: Math.round(d.calories), count: d.count }));
  const axis = { stroke: colors.muted, fontSize: 11, tickLine: false, axisLine: false } as const;

  const chart = (key: 'protein' | 'calories', target: number, color: string, unit: string) => (
    <Card className="!p-3 !pt-4">
      <div className="flex items-baseline justify-between px-2 mb-2">
        <h3 className="text-[15px] font-semibold">{key === 'protein' ? 'Protein' : 'Calories'}</h3>
        <span className="text-[12px] text-muted">target {fmtNum(target, 0)} {unit}</span>
      </div>
      <div style={{ height: 170 }} role="img" aria-label={`${key} per day chart`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 6, right: 6, bottom: 0, left: 0 }} barCategoryGap={view === 'month' ? 2 : 8}>
            <CartesianGrid vertical={false} stroke={colors.border} strokeDasharray="3 4" />
            <XAxis dataKey="label" {...axis} interval={view === 'month' ? 2 : 0} />
            <YAxis {...axis} width={36} tickFormatter={v => (v >= 1000 ? `${v / 1000}k` : String(v))} />
            <Tooltip
              cursor={{ fill: colors['surface-3'], opacity: 0.5 }}
              contentStyle={{ background: colors['surface-3'], border: `1px solid ${colors.border}`, borderRadius: 12, color: colors.text, fontSize: 13 }}
              labelFormatter={(_, p) => (p?.[0]?.payload ? formatDayLabel(p[0].payload.date) : '')}
              formatter={v => [`${fmtNum(Number(v), 0)} ${unit}`, key === 'protein' ? 'Protein' : 'Calories'] as [string, string]}
            />
            <ReferenceLine y={target} stroke={colors.muted} strokeDasharray="5 4" />
            <Bar dataKey={key} radius={[5, 5, 0, 0]} maxBarSize={34}>
              {chartData.map(d => <Cell key={d.date} fill={d[key] > target * (key === 'calories' ? 1.05 : 99) ? colors.danger : color} fillOpacity={d.date === today ? 1 : 0.85} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );

  return (
    <>
      <PageHeader
        title="History" subtitle={title}
        left={<IconButton icon="chevL" label="Previous" onClick={() => step(-1)} />}
        right={<><IconButton icon="chevR" label="Next" onClick={() => step(1)} disabled={to >= addDays(today, view === 'week' ? 6 : 31) && from > today} /></>}
      />
      <main className="px-4 pb-8 max-w-xl mx-auto space-y-4 pt-3">
        <Segmented value={view} onChange={v => { setView(v); setAnchor(todayStr()); }} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />

        {logged.length === 0 ? (
          <EmptyState icon="history" title="No entries in this period" body="Log some food and your trends will show up here." />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Card className="!p-3 text-center"><div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Avg protein</div><div className="text-[24px] font-bold text-protein tabular">{fmtNum(avg('protein'), 0)}<span className="text-[12px] text-muted"> g</span></div></Card>
              <Card className="!p-3 text-center"><div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Avg kcal</div><div className="text-[24px] font-bold text-kcal tabular">{fmtKcal(avg('calories'))}</div></Card>
              <Card className="!p-3 text-center"><div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Protein goal</div><div className="text-[24px] font-bold tabular">{hitDays}<span className="text-[12px] text-muted">/{logged.length} d</span></div></Card>
            </div>
            {chart('protein', targets.protein, colors.protein, 'g')}
            {chart('calories', targets.calories, colors.calories, 'kcal')}
          </>
        )}

        <Card className="!p-0 overflow-hidden">
          {[...days].reverse().filter(d => d.date <= addDays(today, 0) || d.count > 0).map(d => (
            <button key={d.date} type="button" className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-line/60 last:border-b-0 active:bg-surface2"
              onClick={() => { setSelectedDate(d.date); navigate('/'); }}>
              <div className="w-[88px] shrink-0">
                <div className={`text-[15px] font-medium ${d.date === today ? 'text-accent' : ''}`}>{formatDayLabel(d.date, today)}</div>
                <div className="text-[12px] text-muted">{d.count ? `${d.count} item${d.count === 1 ? '' : 's'}` : 'nothing logged'}</div>
              </div>
              <div className="flex-1 min-w-0">
                <ProgressBar value={d.protein} target={targets.protein} color="var(--protein)" height={6} />
                <ProgressBar value={d.calories} target={targets.calories} color="var(--calories)" height={6} className="mt-1.5" />
              </div>
              <div className="text-right tabular w-[78px] shrink-0">
                <div className="text-[15px] font-bold text-protein">{fmtNum(d.protein, 0)} g</div>
                <div className="text-[12px] text-muted">{fmtKcal(d.calories)} kcal</div>
              </div>
            </button>
          ))}
        </Card>
      </main>
    </>
  );
}
