import { CompareTable } from '../../components/CompareTable';
import { NumInput } from '../../components/ui/NumInput';
import { Notice, Field } from '../../components/ui/misc';
import { fmtNum, explainCaloriesChange, type CookingResult } from '../../lib/engine';

interface Props {
  rawW: number | null;
  cookedW: number | null;
  onRawChange: (v: number | null) => void;
  onCookedChange: (v: number | null) => void;
  result: CookingResult | null;
  retention?: number;
  /** True when no batch weights were given and the typical yield is used. */
  usingTypical: boolean;
  basisLabel: string;
}

/** Inputs + explanation for the raw → cooked conversion of a batch. */
export function CookPanel({ rawW, cookedW, onRawChange, onCookedChange, result, retention, usingTypical, basisLabel }: Props) {
  return (
    <div className="space-y-3 rounded-3xl bg-surface2/60 border border-line/70 p-3.5">
      <div className="grid grid-cols-2 gap-3">
        <Field label={basisLabel === 'raw' ? 'Raw weight' : 'Weight as packed'}>
          <NumInput value={rawW} onChange={onRawChange} suffix="g" placeholder="1000" aria-label="Raw weight of the batch in grams" inputClassName="bg-surface" />
        </Field>
        <Field label="Cooked weight">
          <NumInput value={cookedW} onChange={onCookedChange} suffix="g" placeholder="800" aria-label="Cooked weight of the batch in grams" inputClassName="bg-surface" />
        </Field>
      </div>

      {usingTypical && retention ? (
        <Notice tone="info">
          No batch weights entered, so Demeter uses a typical cooked yield of <b>{fmtNum(retention, 0)}%</b> for this food. Weigh the whole batch before and after cooking for exact numbers.
        </Notice>
      ) : null}

      {result && result.per100Cooked && (
        <>
          <CompareTable raw={result.per100Raw} cooked={result.per100Cooked} />
          {result.explanation && (
            <p className="text-[14px] leading-snug text-ink/90">
              {result.explanation} {result.per100Raw && result.per100Cooked ? explainCaloriesChange(result.per100Raw, result.per100Cooked) : ''}
            </p>
          )}
        </>
      )}
      {result?.errors.map(e => <Notice key={e.code} tone="error">{e.message}</Notice>)}
      {result?.warnings.map(w => <Notice key={w.code} tone="warn">{w.message}</Notice>)}
      {!result && <p className="text-[14px] text-muted">Enter the raw and cooked weight of your whole batch to convert the nutrition to per 100 g cooked.</p>}
    </div>
  );
}
