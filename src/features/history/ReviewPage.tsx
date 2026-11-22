import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, EmptyState, PageHeader, SectionTitle } from '../../components/ui/misc';
import { useAppStore } from '../../hooks/useAppStore';
import { fmtKcal, fmtNum } from '../../lib/engine';
import { DOW_NAMES, buildWeekReview, mealLabel } from '../../lib/review';
import { STREAK_THRESHOLD } from '../../lib/streak';
import { addDays, formatDayLabel, formatShort, todayStr, weekdayShort } from '../../utils/dates';
import { cn } from '../../utils/cn';

const KIND_COLOR: Record<string, string> = { good: 'var(--ok)', short: 'var(--danger)', data: 'var(--muted)', weekday: 'var(--warn)', meal: 'var(--warn)', spread: 'var(--warn)' };

/** Weekly review: what actually happened, from your own log, with one concrete suggestion. */
export default function ReviewPage() {
  const logs = useAppStore(s => s.logs);
  const targets = useAppStore(s => s.targets);
  const navigate = useNavigate();
  const today = todayStr();
  const [anchor, setAnchor] = useState(today);
  const r = useMemo(() => buildWeekReview(logs, targets.protein, anchor, today), [logs, targets.protein, anchor, today]);
  const isCurrent = r.to >= today && r.from <= today;

  const maxV = Math.max(targets.protein, ...r.days.map(d => d.protein), 1);
  const need = targets.protein * STREAK_THRESHOLD;
  const delta = r.prevAvgProtein != null && r.trackedDays > 0 ? r.avgProtein - r.prevAvgProtein : null;
  const maxShare = Math.max(0.01, ...r.meals.map(m => m.share));
  const weekdayMax = Math.max(targets.protein, ...r.weekdays.map(w => w.avg), 1);
  const weakDow = (() => { const u = r.weekdays.filter(w => w.n >= 2); return u.length >= 3 ? [...u].sort((a, b) => a.avg - b.avg)[0].dow : -1; })();

  return (
    <>
      <PageHeader
        title="Weekly review" subtitle={`${formatShort(r.from)} – ${formatShort(r.to)}${isCurrent ? ' · this week' : ''}`}
        left={<IconButton icon="chevL" label="Previous week" tone="glass" onClick={() => setAnchor(a => addDays(a, -7))} />}
        right={<IconButton icon="chevR" label="Next week" tone="glass" onClick={() => setAnchor(a => addDays(a, 7))} disabled={isCurrent} />}
      />
      <main className="px-4 pb-8 max-w-xl mx-auto space-y-4 pt-3">
        <button type="button" onClick={() => navigate('/history')} className="text-[14px] text-accent font-medium flex items-center gap-1 -mb-1 h-8"><Icon name="chevL" size={15} />Trends &amp; history</button>

        <Card className="!p-5" data-testid="review-insight" style={{ borderColor: `color-mix(in srgb, ${KIND_COLOR[r.insight.kind]} 45%, transparent)` }}>
          <div className="flex items-center gap-2 text-[12px] uppercase tracking-wider font-semibold" style={{ color: KIND_COLOR[r.insight.kind] }}>
            <Icon name="sparkle" size={16} />{r.insight.kind === 'good' ? 'Going well' : r.insight.kind === 'data' ? 'Getting started' : 'One thing to try'}
          </div>
          <h2 className="text-[21px] font-bold leading-tight mt-1.5">{r.insight.title}</h2>
          <p className="text-[15px] text-ink/85 leading-snug mt-1.5">{r.insight.body}</p>
        </Card>

        {r.trackedDays === 0 ? (
          <EmptyState icon="history" title="Nothing logged this week" body="Log your meals and this page fills in: averages, best and worst days, where your protein comes from." />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Card className="!p-3 text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Avg protein</div>
                <div className="text-[24px] font-bold text-protein tabular">{fmtNum(r.avgProtein, 0)}<span className="text-[12px] text-muted"> g</span></div>
                {delta != null && Math.abs(delta) >= 1 && <div className={cn('text-[11px] font-semibold tabular', delta > 0 ? 'text-ok' : 'text-danger')}>{delta > 0 ? '▲' : '▼'} {fmtNum(Math.abs(delta), 0)} vs last week</div>}
              </Card>
              <Card className="!p-3 text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Goal days</div>
                <div className="text-[24px] font-bold tabular">{r.daysCounted}<span className="text-[12px] text-muted">/{r.trackedDays}</span></div>
                <div className="text-[11px] text-muted">≥ {Math.round(STREAK_THRESHOLD * 100)}% of goal</div>
              </Card>
              <Card className="!p-3 text-center">
                <div className="text-[11px] uppercase tracking-wide text-muted font-semibold">Avg kcal</div>
                <div className="text-[24px] font-bold text-kcal tabular">{fmtKcal(r.avgCalories)}</div>
              </Card>
            </div>

            <Card className="!p-4">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-[15px] font-semibold">Protein by day</h3>
                <span className="text-[12px] text-muted">goal {fmtNum(targets.protein, 0)} g</span>
              </div>
              <div className="relative h-36">
                <div className="absolute inset-x-0 border-t border-dashed border-muted/50" style={{ bottom: `${(targets.protein / maxV) * 100}%` }} aria-hidden />
                <div className="absolute inset-0 flex items-end gap-2">
                  {r.days.map(d => {
                    const h = d.protein > 0 ? Math.max(4, (d.protein / maxV) * 100) : 0;
                    const hit = d.counted && d.protein >= need;
                    return (
                      <div key={d.date} className="flex-1 h-full flex flex-col items-center justify-end min-w-0" title={`${formatDayLabel(d.date, today)}: ${fmtNum(d.protein, 0)} g`}>
                        {d.count > 0 && <span className="text-[10px] text-muted tabular mb-0.5">{fmtNum(d.protein, 0)}</span>}
                        <div className="w-full rounded-t-md" style={{
                          height: `${h}%`,
                          background: d.count === 0 ? 'transparent' : hit ? 'var(--protein)' : 'color-mix(in srgb, var(--protein) 40%, transparent)',
                          border: d.count > 0 && !d.counted ? '1.5px dashed var(--protein)' : undefined,
                        }} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex gap-2 mt-1.5">
                {r.days.map(d => <div key={d.date} className={cn('flex-1 text-center text-[11px]', d.date === today ? 'text-accent font-semibold' : 'text-muted')}>{weekdayShort(d.date).slice(0, 2)}</div>)}
              </div>
              <p className="text-[12px] text-muted mt-2.5">Solid bars reached {Math.round(STREAK_THRESHOLD * 100)}% of your goal. Days with nothing logged are left out, not counted as zero.{r.todayOpen ? ' Today is still open (dashed).' : ''}</p>
            </Card>

            <div>
              <SectionTitle>Protein by meal</SectionTitle>
              <Card className="!p-4 space-y-3">
                {r.meals.map(m => (
                  <div key={m.meal}>
                    <div className="flex justify-between text-[14px]"><span className="font-medium">{mealLabel(m.meal)}</span><span className="tabular text-muted"><b className="text-ink">{fmtNum(m.avg, 0)} g</b> / day · {Math.round(m.share * 100)}%</span></div>
                    <div className="h-2 rounded-full bg-surface3 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(m.share / maxShare) * 100}%`, background: 'var(--protein)' }} /></div>
                  </div>
                ))}
              </Card>
            </div>

            {r.sources.length > 0 && (
              <div>
                <SectionTitle>Where your protein came from</SectionTitle>
                <Card className="!p-4 space-y-3">
                  {r.sources.map(s => (
                    <div key={s.key}>
                      <div className="flex justify-between gap-3 text-[14px]">
                        <span className="font-medium truncate">{s.name}</span>
                        <span className="tabular text-muted shrink-0"><b className="text-ink">{fmtNum(s.protein, 0)} g</b> · {Math.round(s.share * 100)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-surface3 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${s.share * 100}%`, background: 'var(--accent)' }} /></div>
                      <div className="text-[12px] text-muted mt-0.5">{s.times}× · usually {fmtNum(s.typicalG, 0)} g ({fmtNum(s.typicalProtein, 0)} g protein)</div>
                    </div>
                  ))}
                </Card>
              </div>
            )}

            <div>
              <SectionTitle>Your weekdays (last 8 weeks)</SectionTitle>
              <Card className="!p-4">
                <div className="flex items-end gap-2 h-24">
                  {r.weekdays.map(w => (
                    <div key={w.dow} className="flex-1 h-full flex flex-col justify-end items-center" title={`${DOW_NAMES[w.dow]}: ${fmtNum(w.avg, 0)} g over ${w.n} days`}>
                      <span className="text-[10px] text-muted tabular mb-0.5">{w.n ? fmtNum(w.avg, 0) : '–'}</span>
                      <div className="w-full rounded-t-md" style={{ height: `${w.n ? Math.max(4, (w.avg / weekdayMax) * 100) : 0}%`, background: w.dow === weakDow ? 'var(--warn)' : 'color-mix(in srgb, var(--protein) 70%, transparent)' }} />
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-1.5">{r.weekdays.map(w => <div key={w.dow} className={cn('flex-1 text-center text-[11px]', w.dow === weakDow ? 'text-warn font-semibold' : 'text-muted')}>{DOW_NAMES[w.dow].slice(0, 2)}</div>)}</div>
                <p className="text-[12px] text-muted mt-2.5">Average protein on logged days. Needs a few weeks of data to mean something.</p>
              </Card>
            </div>
          </>
        )}
        <p className="text-[12px] text-muted px-1 text-center">Computed on this device from your own log.</p>
      </main>
    </>
  );
}
