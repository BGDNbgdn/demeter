import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { fmtNum } from '../../lib/engine';

interface Props {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  suffix?: ReactNode;
  className?: string;
  inputClassName?: string;
  max?: number;
  decimals?: number;
  'aria-label'?: string;
  autoFocus?: boolean;
  selectOnFocus?: boolean;
  invalid?: boolean;
  id?: string;
}

/** Decimal-friendly numeric field. Keeps raw text while typing ("12.") and reports a clean number|null. */
export function NumInput({
  value, onChange, placeholder, suffix, className, inputClassName, max, decimals = 2,
  autoFocus, selectOnFocus = true, invalid, id, ...rest
}: Props) {
  const [text, setText] = useState(value == null ? '' : fmtNum(value, decimals).replace(/,/g, ''));
  const focused = useRef(false);

  // Sync when the parent changes the value (e.g. chips / steppers) but not while the user is typing.
  useEffect(() => {
    if (focused.current) {
      const parsed = parse(text);
      if (parsed === value || (parsed == null && value == null)) return;
    }
    setText(value == null ? '' : fmtNum(value, decimals).replace(/,/g, ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className={cn('relative flex items-center', className)}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        autoFocus={autoFocus}
        aria-label={rest['aria-label']}
        aria-invalid={invalid || undefined}
        placeholder={placeholder}
        value={text}
        onFocus={e => { focused.current = true; if (selectOnFocus) e.currentTarget.select(); }}
        onBlur={() => { focused.current = false; setText(value == null ? '' : fmtNum(value, decimals).replace(/,/g, '')); }}
        onChange={e => {
          const t = e.target.value.replace(',', '.');
          if (t !== '' && !/^\d*\.?\d*$/.test(t)) return;
          setText(t);
          let v = parse(t);
          if (v != null && max != null && v > max) v = max;
          onChange(v);
        }}
        className={cn(
          'w-full h-12 rounded-2xl bg-surface2 border border-line px-4 text-[18px] font-medium tabular focus:border-accent outline-none',
          suffix ? 'pr-12' : '', invalid && 'border-danger', inputClassName,
        )}
      />
      {suffix && <span className="pointer-events-none absolute right-4 text-muted text-[15px]">{suffix}</span>}
    </div>
  );
}

function parse(t: string): number | null {
  if (t === '' || t === '.') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
