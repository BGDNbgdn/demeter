import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../utils/cn';
import { IconButton } from './Button';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Full-screen on small screens (used for search & editors). */
  tall?: boolean;
  children: ReactNode;
  footer?: ReactNode;
  headerRight?: ReactNode;
  zIndex?: number;
}

let lockCount = 0;
function lockScroll(lock: boolean) {
  lockCount += lock ? 1 : -1;
  document.body.style.overflow = lockCount > 0 ? 'hidden' : '';
}

/** Bottom sheet (modal). Closes on backdrop tap or Escape. */
export function Sheet({ open, onClose, title, tall, children, footer, headerRight, zIndex = 50 }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    lockScroll(true);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); lockScroll(false); };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 flex items-end justify-center" style={{ zIndex }} role="dialog" aria-modal="true">
      <div className="absolute inset-0 anim-fade" style={{ background: 'var(--overlay)' }} onClick={onClose} />
      <div
        ref={ref}
        className={cn(
          'relative w-full max-w-xl sheet-glass anim-sheet flex flex-col rounded-t-[32px]',
          tall ? 'h-[calc(100dvh-env(safe-area-inset-top)-12px)]' : 'max-h-[92dvh]',
        )}
      >
        <div className="flex items-center gap-2 pl-5 pr-2 pt-2 min-h-[56px] shrink-0">
          <div className="absolute left-1/2 top-2 -translate-x-1/2 h-1 w-10 rounded-full bg-surface3" />
          <h2 className="flex-1 min-w-0 text-[19px] font-semibold leading-tight line-clamp-3 pt-2">{title}</h2>
          <div className="pt-1">{headerRight}</div>
          <IconButton icon="x" label="Close" tone="glass" onClick={onClose} className="mt-1" />
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 scrollbar-none">{children}</div>
        {footer && <div className="shrink-0 px-5 pt-3 pb-safe border-t border-line"><div className="pb-3">{footer}</div></div>}
        {!footer && <div className="pb-safe" />}
      </div>
    </div>,
    document.body,
  );
}
