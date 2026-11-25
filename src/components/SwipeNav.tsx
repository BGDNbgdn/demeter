import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** The pages you can swipe between, in tab order (Kitchen's four views sit together). */
export const SWIPE_ORDER = ['/', '/foods', '/recipes', '/fridge', '/plan', '/shop', '/value', '/history', '/settings'];

const EDGE = 24; // the screen edges belong to iOS (back gesture)
const MIN_DX = 80;

/** Where a horizontal swipe goes: left → next page, right → previous. null = nothing there. */
export function swipeTarget(path: string, dx: number, dy: number, ms: number): string | null {
  if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * 2 || ms > 700) return null;
  const i = SWIPE_ORDER.indexOf(path);
  if (i < 0) return null;
  return SWIPE_ORDER[i + (dx < 0 ? 1 : -1)] ?? null;
}

/** Things a swipe must leave alone: fields, open sheets, rows with their own swipe, sideways-scrolling strips. */
function blocked(el: Element | null): boolean {
  if (!el) return true;
  if (el.closest('[data-no-swipe], input, textarea, select, canvas, video, [role="dialog"], [role="alertdialog"]')) return true;
  for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
    const ox = getComputedStyle(n).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && n.scrollWidth > n.clientWidth + 2) return true;
  }
  return false;
}

/** Swipe left/right anywhere on a page to move to the next/previous tab. */
export function SwipeNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    let start: { x: number; y: number; t: number } | null = null;
    const onStart = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1 || document.body.style.overflow === 'hidden') return;
      const t = e.touches[0];
      if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
      if (blocked(e.target as Element)) return;
      start = { x: t.clientX, y: t.clientY, t: Date.now() };
    };
    const onEnd = (e: TouchEvent) => {
      const s = start; start = null;
      if (!s || document.body.style.overflow === 'hidden') return;
      const t = e.changedTouches[0];
      const to = swipeTarget(path.current, t.clientX - s.x, t.clientY - s.y, Date.now() - s.t);
      if (to) navigate(to);
    };
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    return () => { document.removeEventListener('touchstart', onStart); document.removeEventListener('touchend', onEnd); };
  }, [navigate]);
  return null;
}

/** Slides the new page in from the side it is "next to" (only for the swipeable tab pages). */
export function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const prev = useRef(pathname);
  const dir = useRef<'fwd' | 'back' | 'none'>('none');
  if (prev.current !== pathname) {
    const a = SWIPE_ORDER.indexOf(prev.current); const b = SWIPE_ORDER.indexOf(pathname);
    dir.current = a < 0 || b < 0 ? 'none' : b > a ? 'fwd' : 'back';
    prev.current = pathname;
  }
  return <div key={pathname} className={dir.current === 'fwd' ? 'anim-page-fwd' : dir.current === 'back' ? 'anim-page-back' : undefined}>{children}</div>;
}
