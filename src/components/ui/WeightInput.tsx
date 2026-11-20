import { useRef } from 'react';
import { cn } from '../../utils/cn';
import type { Serving } from '../../types';
import { NumInput } from './NumInput';
import { Icon } from './Icon';

export const QUICK_WEIGHTS = [50, 100, 150, 200, 250, 300];

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  step?: number;
  chips?: number[];
  servings?: Serving[];
  suffix?: string;
  placeholder?: string;
  autoFocus?: boolean;
  invalid?: boolean;
  compact?: boolean;
  'aria-label'?: string;
}

/** Big numeric weight field with − / + steppers, quick-select chips and per-food serving chips. */
export function WeightInput({
  value, onChange, step = 10, chips = QUICK_WEIGHTS, servings, suffix = 'g', placeholder = '0',
  autoFocus, invalid, compact, ...rest
}: Props) {
  const hold = useRef<ReturnType<typeof setInterval> | null>(null);
  const valRef = useRef(value);
  valRef.current = value;

  const bump = (dir: 1 | -1) => {
    const next = Math.max(0, Math.round(((valRef.current ?? 0) + dir * step) * 100) / 100);
    onChange(next === 0 ? null : next);
  };
  const startHold = (dir: 1 | -1) => {
    bump(dir);
    stopHold();
    const t = setTimeout(() => { hold.current = setInterval(() => bump(dir), 90); }, 380);
    hold.current = t as unknown as ReturnType<typeof setInterval>;
  };
  const stopHold = () => { if (hold.current) { clearInterval(hold.current); clearTimeout(hold.current as unknown as number); hold.current = null; } };

  const stepBtn = 'h-12 w-12 shrink-0 rounded-2xl bg-surface2 text-ink flex items-center justify-center active:bg-surface3 select-none';
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <button type="button" aria-label={`Decrease by ${step}`} className={stepBtn} onPointerDown={() => startHold(-1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}>
          <Icon name="minus" />
        </button>
        <NumInput
          value={value} onChange={onChange} suffix={suffix} placeholder={placeholder} autoFocus={autoFocus} invalid={invalid}
          className="flex-1" inputClassName={cn('text-center text-[22px] font-semibold', compact ? 'h-12' : 'h-14')} aria-label={rest['aria-label'] ?? 'Weight in grams'}
        />
        <button type="button" aria-label={`Increase by ${step}`} className={stepBtn} onPointerDown={() => startHold(1)} onPointerUp={stopHold} onPointerLeave={stopHold} onPointerCancel={stopHold}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-5 px-5 pb-0.5">
        {servings?.map(s => (
          <Chip key={s.label + s.grams} active={value === s.grams} onClick={() => onChange(s.grams)} accent>
            {s.label} · {fmt(s.grams)} g
          </Chip>
        ))}
        {chips.map(c => (
          <Chip key={c} active={value === c} onClick={() => onChange(c)}>{c} g</Chip>
        ))}
      </div>
    </div>
  );
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function Chip({ active, accent, className, children, ...rest }: { active?: boolean; accent?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={cn(
        'shrink-0 h-10 px-3.5 rounded-full text-[15px] font-medium border transition-colors select-none whitespace-nowrap',
        active ? 'bg-accent text-accentink border-accent' : accent ? 'bg-accentsoft text-accent border-transparent active:opacity-70' : 'bg-surface2 text-ink border-transparent active:bg-surface3',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
