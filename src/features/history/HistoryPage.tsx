import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { IconButton } from '../../components/ui/Button';
import { Card, EmptyState, PageHeader, ProgressBar, Segmented } from '../../components/ui/misc';
import { useAppStore } from '../../hooks/useAppStore';
import { cn } from '../../utils/cn';
import { useThemeColors } from '../../hooks/useThemeColors';
import { fmtKcal, fmtNum } from '../../lib/engine';
import { dailyTotals } from '../../lib/logging';
import { computeStreaks } from '../../lib/streak';
import { buildWeekReview } from '../../lib/review';
import { Icon } from '../../components/ui/Icon';
import { addDays, dateRange, endOfMonth, formatDayLabel, formatShort, monthTitle, parseDateStr, startOfMonth, startOfWeek, todayStr, weekdayShort } from '../../utils/dates';

export default function HistoryPage() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(todayStr());
  const logs = useAppStore(s => s.logs);
  const targets = useAppStore(s => s.targets);
  const setSelectedDate = useAppStore(s => s.setSelectedDate);
  const navigate = useNavigate();
  const colors = useThemeColors();
  const streak = useMemo(() => computeStreaks(logs, targets.protein), [logs, targets.protein]);
  const reviewTeaser = useMemo(() => buildWeekReview(logs, targets.protein, todayStr()).insight, [logs, targets.protein]);

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
        left={<IconButton icon="chevL" label="Previous" tone="glass" onClick={() => step(-1)} />}
        right={<><IconButton icon="chevR" label="Next" tone="glass" onClick={() => step(1)} disabled={to >= addDays(today, view === 'week' ? 6 : 31) && from > today} /></>}
      />
      <main className="px-4 pb-8 max-w-xl mx-auto space-y-4 pt-3">
        <Segmented value={view} onChange={v => { setView(v); setAnchor(todayStr()); }} options={[{ value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} />

        <Card className="!px-[18px] !py-3.5" data-testid="streak-card">
          <div className="flex items-center gap-3.5">
            <p className="font-dot text-[54px] leading-none tabular-nums">{streak.current}</p>
            <div>
              <b className="block text-[20px] font-bold leading-tight">day streak</b>
              <span className="text-[13px] text-muted">best {streak.best}</span>
            </div>
          </div>
          <p className="text-[13px] leading-snug text-muted mt-2">A day counts when you reach {Math.round(streak.threshold * 100)}% of your protein goal ({fmtNum(targets.protein * streak.threshold, 0)} g). Meals and calories don’t matter.</p>
        </Card>

        <button type="button" onClick={() => navigate('/review')} data-testid="review-link"
          className="w-full text-left rounded-[28px] glass p-4 flex items-center gap-4 active:opacity-80">
          <span className="bg-grad h-11 w-11 rounded-full flex items-center justify-center shrink-0" style={{ boxShadow: 'none' }}><Icon name="sparkle" /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[17px] font-bold leading-tight">Weekly review</span>
            <span className="block text-[13px] text-muted leading-snug mt-0.5 truncate">{reviewTeaser.title}</span>
          </span>
          <Icon name="chevR" size={18} className="text-muted" />
        </button>

        {logged.length === 0 ? (
          <EmptyState icon="history" title="No entries in this period" body="Log some food and your trends will show up here." />
        ) : (
          <>
            <Card className="!px-0 !py-3 grid grid-cols-3">
              {[
                { label: 'Avg protein', value: fmtNum(avg('protein'), 0), unit: ' g' },
                { label: 'Avg kcal', value: fmtKcal(avg('calories')), unit: '' },
                { label: 'Protein goal', value: String(hitDays), unit: `/${logged.length} d` },
              ].map((x, i) => (
                <div key={x.label} className={cn('px-4', i > 0 && 'border-l border-line')}>
                  <p className="text-[12px] text-muted font-semibold">{x.label}</p>
                  <b className="block text-[30px] leading-[1.1] font-bold tracking-[-0.02em] tabular mt-0.5">{x.value}<small className="text-[13px] font-semibold text-muted tracking-normal">{x.unit}</small></b>
                </div>
              ))}
            </Card>
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
