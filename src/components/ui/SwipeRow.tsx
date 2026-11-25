import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Icon, type IconName } from './Icon';

const REVEAL = 92; // width of the action button, px
const FULL_SWIPE = 0.55; // swiping past this share of the row's width runs the action straight away

interface Props {
  children: ReactNode;
  /** Shown on the button revealed by swiping left, e.g. "Delete". */
  actionLabel: string;
  onAction: () => void;
  icon?: IconName;
  radius?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Swipe a row to the left to reveal an action (delete / ran out). Swipe far enough and it runs at once.
 * Vertical scrolling is untouched. Every action it is used for has an Undo, so a stray swipe is harmless.
 */
export function SwipeRow({ children, actionLabel, onAction, icon = 'trash', radius = 'rounded-[26px]', className, disabled }: Props) {
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const st = useRef({ id: -1, sx: 0, sy: 0, base: 0, mode: 'idle' as 'idle' | 'h' | 'v', width: 300 });
  const justDragged = useRef(false);
  const open = x <= -REVEAL + 1;

  // tapping anywhere else closes an open row
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setX(0); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const fire = () => {
    setX(-(box.current?.offsetWidth ?? 320));
    window.setTimeout(() => { onAction(); setX(0); }, 170);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    st.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, base: x, mode: 'idle', width: box.current?.offsetWidth ?? 320 };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const s = st.current;
    if (e.pointerId !== s.id || s.mode === 'v') return;
    const dx = e.clientX - s.sx; const dy = e.clientY - s.sy;
    if (s.mode === 'idle') {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        s.mode = 'h'; setDragging(true);
        try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignore */ }
      } else if (Math.abs(dy) > 10) { s.mode = 'v'; return; } else return;
    }
    setX(Math.max(-s.width, Math.min(0, s.base + dx)));
  };
  const end = (e: React.PointerEvent) => {
    const s = st.current;
    if (e.pointerId !== s.id) return;
    st.current = { ...s, id: -1 };
    if (s.mode !== 'h') return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    setDragging(false);
    justDragged.current = true;
    window.setTimeout(() => { justDragged.current = false; }, 60);
    if (-x > s.width * FULL_SWIPE) fire();
    else setX(-x > REVEAL * 0.45 ? -REVEAL : 0);
  };
  // a drag must not count as a tap on whatever is inside; a tap on an open row just closes it
  const onClickCapture = (e: React.MouseEvent) => {
    if (justDragged.current) { e.stopPropagation(); e.preventDefault(); return; }
    if (x !== 0) { e.stopPropagation(); e.preventDefault(); setX(0); }
  };

  return (
    <div ref={box} data-no-swipe className={cn('relative', x !== 0 && 'overflow-hidden', radius, className)}>
      {x < 0 && (
        <div className={cn('absolute inset-y-0 right-0 flex justify-end overflow-hidden', radius)} style={{ width: -x, background: 'linear-gradient(135deg,#ff7b8a,#e5484d)' }}>
          <button
            type="button" onClick={fire} tabIndex={open ? 0 : -1} aria-hidden={!open} aria-label={actionLabel}
            className="h-full flex flex-col items-center justify-center gap-1 text-white text-[13px] font-bold shrink-0 active:opacity-80"
            style={{ width: REVEAL }}
          >
            <Icon name={icon} size={22} />{actionLabel}
          </button>
        </div>
      )}
      <div
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={end} onPointerCancel={end} onClickCapture={onClickCapture}
        style={{ transform: `translateX(${x}px)`, transition: dragging ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)', touchAction: 'pan-y', userSelect: dragging ? 'none' : undefined, WebkitUserSelect: dragging ? 'none' : undefined }}
      >
        {children}
      </div>
    </div>
  );
}
