import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Field, Notice } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { Chip } from '../../components/ui/WeightInput';
import { fmtNum } from '../../lib/engine';
import { calcDraft, factorForTarget, scaleDraft, type RecipeDraft } from '../../lib/recipes';

const FACTORS = [0.5, 0.75, 1.5, 2, 3];

/** Scale every weight in a recipe (×1.5 …) or aim for a target total. Per-100 g nutrition never changes. */
export function ScaleSheet({ open, onClose, draft, canCopy, onApply, onCopy }: {
  open: boolean; onClose: () => void; draft: RecipeDraft; canCopy: boolean;
  onApply: (factor: number) => void; onCopy: (factor: number) => void;
}) {
  const [factor, setFactor] = useState<number | null>(1.5);
  const [target, setTarget] = useState<number | null>(null);
  const before = useMemo(() => calcDraft(draft), [draft]);
  const f = factor && factor > 0 ? factor : null;
  const after = useMemo(() => (f ? calcDraft(scaleDraft(draft, f)) : null), [draft, f]);
  const hasCooked = !!draft.cookedTotalWeightG;
  const baseLabel = hasCooked ? 'cooked weight' : 'raw weight';

  return (
    <Sheet open={open} onClose={onClose} title="Scale recipe"
      footer={
        <div className="space-y-2">
          {canCopy && <Button variant="primary" size="lg" block disabled={!f} onClick={() => f && onCopy(f)}>Save as a new recipe{f ? ` (×${fmtNum(f, 2)})` : ''}</Button>}
          <Button variant={canCopy ? 'secondary' : 'primary'} size={canCopy ? 'md' : 'lg'} block disabled={!f} onClick={() => f && onApply(f)}>{canCopy ? 'Scale this recipe instead' : `Scale ×${f ? fmtNum(f, 2) : ''}`}</Button>
        </div>
      }>
      <div className="space-y-4 pt-1">
        <p className="text-[14px] text-muted">Every ingredient weight{hasCooked ? ' and the cooked weight' : ''} is multiplied. Nutrition <b className="text-ink">per 100 g stays exactly the same</b>; totals scale.</p>
        <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5">
          {FACTORS.map(x => <Chip key={x} active={factor === x && target == null} onClick={() => { setFactor(x); setTarget(null); }}>×{x}</Chip>)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Custom factor"><NumInput value={factor} onChange={v => { setFactor(v); setTarget(null); }} suffix="×" placeholder="1.5" /></Field>
          <Field label={`Or aim for a ${baseLabel} of`}>
            <NumInput value={target} onChange={v => { setTarget(v); const t = v ? factorForTarget(draft, v) : null; if (t) setFactor(Math.round(t * 1000) / 1000); }} suffix="g" placeholder={hasCooked ? '2000' : '1500'} />
          </Field>
        </div>
        {after && f && (
          <div className="rounded-2xl bg-surface2 p-3.5 text-[14px] space-y-1.5 tabular" data-testid="scale-preview">
            <div className="flex justify-between"><span className="text-muted">Raw total</span><span>{fmtNum(before.rawTotalWeightG, 0)} g → <b>{fmtNum(after.rawTotalWeightG, 0)} g</b></span></div>
            {hasCooked && <div className="flex justify-between"><span className="text-muted">Cooked total</span><span>{fmtNum(before.cookedTotalWeightG ?? 0, 0)} g → <b>{fmtNum(after.cookedTotalWeightG ?? 0, 0)} g</b></span></div>}
            <div className="flex justify-between"><span className="text-muted">Protein (whole recipe)</span><span>{fmtNum(before.totals.protein, 0)} g → <b className="text-protein">{fmtNum(after.totals.protein, 0)} g</b></span></div>
            <div className="flex justify-between"><span className="text-muted">Calories (whole recipe)</span><span>{fmtNum(before.totals.calories, 0)} → <b className="text-kcal">{fmtNum(after.totals.calories, 0)}</b></span></div>
            {after.per100Cooked && <div className="flex justify-between"><span className="text-muted">Protein per 100 g cooked</span><span>{fmtNum(before.per100Cooked?.protein ?? 0, 1)} g → <b>{fmtNum(after.per100Cooked.protein, 1)} g</b> (unchanged)</span></div>}
          </div>
        )}
        {canCopy
          ? <Notice tone="info"><span className="text-[13px]">“Save as a new recipe” keeps this one — and its batch tracking — untouched.</span></Notice>
          : <Notice tone="info"><span className="text-[13px]">This recipe isn’t saved yet, so it is scaled in place. You can undo right after.</span></Notice>}
      </div>
    </Sheet>
  );
}
