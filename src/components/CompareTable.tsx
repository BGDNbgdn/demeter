import { fmtNum } from '../lib/engine';
import type { Macros } from '../types';
import { cn } from '../utils/cn';

/** Side-by-side "per 100 g raw" vs "per 100 g cooked" values. */
export function CompareTable({ raw, cooked, rawLabel = 'Per 100 g raw', cookedLabel = 'Per 100 g cooked', className }: {
  raw: Macros | null; cooked: Macros | null; rawLabel?: string; cookedLabel?: string; className?: string;
}) {
  const row = (label: string, m: Macros | null, strong?: boolean) => (
    <tr className={cn(strong && 'font-semibold')}>
      <td className={cn('py-2 pr-2 text-[13px]', strong ? 'text-ink' : 'text-muted')}>{label}</td>
      <td className="py-2 text-right tabular text-protein">{m ? fmtNum(m.protein, 1) : '–'}</td>
      <td className="py-2 text-right tabular text-kcal">{m ? fmtNum(m.calories, 1) : '–'}</td>
      <td className="py-2 text-right tabular text-carbs">{m ? fmtNum(m.carbs, 1) : '–'}</td>
      <td className="py-2 text-right tabular text-fat">{m ? fmtNum(m.fat, 1) : '–'}</td>
    </tr>
  );
  return (
    <table className={cn('w-full text-[15px]', className)}>
      <thead>
        <tr className="text-[11px] uppercase tracking-wide text-muted">
          <th className="text-left font-semibold pb-1" />
          <th className="text-right font-semibold pb-1">Protein</th>
          <th className="text-right font-semibold pb-1">kcal</th>
          <th className="text-right font-semibold pb-1">Carbs</th>
          <th className="text-right font-semibold pb-1">Fat</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line/60">
        {row(rawLabel, raw)}
        {row(cookedLabel, cooked, true)}
      </tbody>
    </table>
  );
}
