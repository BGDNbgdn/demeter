import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import { fmtKcal, fmtNum, fmtSmart } from '../../lib/engine';
import type { Macros, NutritionBasis } from '../../types';
import { Button, IconButton } from './Button';
import { Icon, type IconName } from './Icon';
import { useAppStore } from '../../hooks/useAppStore';

// ------------------------------------------------------------------ layout
/**
 * Page title block. Default: a large title that scrolls away (the date / context sits above it).
 * `sticky` = compact bar that stays on top — used by long editors where Save must stay reachable.
 */
export function PageHeader({ title, subtitle, right, left, sticky }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; left?: ReactNode; sticky?: boolean }) {
  const inner = (
    <div className={cn('flex gap-2 px-4 max-w-xl mx-auto', sticky ? 'items-center min-h-[60px]' : 'items-end pt-3 pb-3.5')}>
      {left}
      <div className="flex-1 min-w-0">
        {subtitle && <div className={cn('text-muted leading-tight truncate', sticky ? 'text-[12px]' : 'text-[14px] mb-0.5')}>{subtitle}</div>}
        <h1 className={cn('font-bold tracking-[-0.02em] leading-[1.05] truncate', sticky ? 'text-[22px]' : 'text-[36px]')}>{title}</h1>
      </div>
      {right && <div className="flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
  return sticky
    ? <header className="sticky top-0 z-20 pt-safe backdrop-blur-2xl border-b border-line" style={{ background: 'color-mix(in srgb, var(--bg) 52%, transparent)' }}>{inner}</header>
    : <header className="pt-safe">{inner}</header>;
}

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('glass rounded-[28px] p-4', className)} {...rest}>{children}</div>;
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pt-5 pb-2">
      <h3 className="text-[13px] uppercase tracking-wider font-semibold text-muted">{children}</h3>
      {right}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-[13px] font-medium text-muted mb-1.5 px-1">{label}</span>
      {children}
      {hint && <span className="block text-[12px] text-muted mt-1 px-1">{hint}</span>}
    </label>
  );
}

export function TextInput({ className, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn('w-full h-12 rounded-2xl bg-surface2 border border-line px-4 text-[17px] focus:border-accent outline-none', className)}
      {...rest}
    />
  );
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-10 gap-3">
      <div className="orb h-[104px] w-[104px] rounded-full flex items-center justify-center"><Icon name={icon} size={44} strokeWidth={1.6} /></div>
      <div className="text-[26px] font-bold tracking-[-0.02em] leading-tight mt-3">{title}</div>
      {body && <div className="text-[16px] leading-snug text-muted max-w-[320px]">{body}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ segmented control
export function Segmented<T extends string>({ value, onChange, options, className }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; className?: string;
}) {
  return (
    <div role="tablist" className={cn('glass flex p-[5px] rounded-full gap-1', className)}>
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'flex-1 h-11 rounded-full text-[15px] font-semibold transition-colors select-none px-1 truncate',
            value === o.value ? 'pill-on' : 'text-muted active:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ progress
export function ProgressBar({ value, target, color, height = 8, className }: { value: number; target: number; color: string; height?: number; className?: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target * 1.0001;
  return (
    <div className={cn('w-full rounded-full overflow-hidden', className)} style={{ height, background: 'var(--surface-3)' }} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemax={target}>
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: over ? 'var(--danger)' : color }} />
    </div>
  );
}

// ------------------------------------------------------------------ nutrition display
export function MacroLine({ m, detail, className }: { m: Macros; detail?: boolean; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-3 text-[13px] text-muted tabular', className)}>
      <span><b className="text-protein font-semibold">{fmtSmart(m.protein, { detail })}</b> P</span>
      <span><b className="text-carbs font-semibold">{fmtSmart(m.carbs, { detail })}</b> C</span>
      <span><b className="text-fat font-semibold">{fmtSmart(m.fat, { detail })}</b> F</span>
      <span><b className="text-kcal font-semibold">{fmtKcal(m.calories, detail)}</b> kcal</span>
    </div>
  );
}

export function MacroGrid({ m, big = false }: { m: Macros; big?: boolean }) {
  // whole numbers from 1,000 up so four columns never overflow on a phone
  const v = (x: number) => (Math.abs(x) >= 1000 ? fmtNum(x, 0) : fmtNum(x, 1));
  const cell = (label: string, value: string, color: string) => (
    <div className="min-w-0 rounded-2xl bg-surface2 px-2.5 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-muted font-semibold truncate">{label}</div>
      <div className={cn('font-bold tabular leading-tight tracking-tight', big ? 'text-[22px]' : 'text-[18px]')} style={{ color }}>{value}</div>
    </div>
  );
  return (
    <div className="grid grid-cols-4 gap-2">
      {cell('Protein g', v(m.protein), 'var(--protein)')}
      {cell('Calories', v(m.calories), 'var(--calories)')}
      {cell('Carbs g', v(m.carbs), 'var(--carbs)')}
      {cell('Fat g', v(m.fat), 'var(--fat)')}
    </div>
  );
}

const BASIS_LABEL: Record<NutritionBasis, string> = { raw: 'Raw', cooked: 'Cooked', 'as-packaged': 'As packed' };
export function BasisBadge({ basis, className }: { basis: NutritionBasis; className?: string }) {
  return <span className={cn('inline-block text-[11.5px] font-semibold px-2 py-px rounded-[9px] bg-surface3 text-ink align-middle leading-[1.5]', className)}>{BASIS_LABEL[basis]}</span>;
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode; className?: string }) {
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'error' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : 'var(--calories)';
  const icon: IconName = tone === 'info' || tone === 'ok' ? 'info' : 'alert';
  return (
    <div className={cn('flex gap-2.5 rounded-2xl px-3.5 py-3 text-[14px] leading-snug', className)} style={{ color, background: 'color-mix(in srgb, currentColor 11%, transparent)' }}>
      <Icon name={icon} size={18} className="shrink-0 mt-0.5" />
      <div className="text-ink/90 [&_b]:text-ink">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ toast + confirm
export function ToastHost() {
  const toast = useAppStore(s => s.toast);
  const dismiss = useAppStore(s => s.dismissToast);
  if (!toast) return null;
  const tone = toast.tone === 'error' ? 'var(--danger)' : toast.tone === 'success' ? 'var(--ok)' : 'var(--text)';
  return createPortal(
    <div className="fixed left-0 right-0 z-[80] flex justify-center px-4 pointer-events-none" style={{ bottom: 'calc(112px + env(safe-area-inset-bottom))' }}>
      <div key={toast.id} className="anim-toast pointer-events-auto max-w-md w-full flex items-center gap-3 rounded-2xl sheet-glass border border-line px-4 py-3 text-[15px]" role="status">
        <span className="flex-1" style={{ color: tone }}>{toast.message}</span>
        {toast.actionLabel && (
          <button className="font-semibold text-accent px-1 h-8" onClick={() => { toast.onAction?.(); dismiss(); }}>{toast.actionLabel}</button>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Confirm({ open, title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }: {
  open: boolean; title: string; message?: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-6" role="alertdialog" aria-modal="true">
      <div className="absolute inset-0 anim-fade" style={{ background: 'var(--overlay)' }} onClick={onCancel} />
      <div className="relative anim-pop w-full max-w-sm rounded-[28px] sheet-glass border border-line p-5">
        <h2 className="text-[19px] font-semibold">{title}</h2>
        {message && <div className="text-[15px] text-muted mt-2 leading-snug">{message}</div>}
        <div className="flex gap-2 mt-5">
          <Button variant="secondary" block onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? 'danger' : 'primary'} block onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export { IconButton };
