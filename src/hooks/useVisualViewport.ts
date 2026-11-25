import { useEffect } from 'react';

export interface ViewportVars { height: number; top: number; keyboardOpen: boolean }

/**
 * What the user can actually see. On iPhone the on-screen keyboard does NOT shrink the page (the "layout viewport");
 * it only shrinks the *visual* viewport and iOS pans it to reveal the focused field. Bottom sheets sized to the full
 * screen then end up half off-screen. So sheets are sized to the visual viewport instead.
 */
export function computeViewportVars(vv: { height: number; offsetTop: number; scale?: number } | null | undefined, innerHeight: number): ViewportVars {
  if (!vv) return { height: innerHeight, top: 0, keyboardOpen: false };
  // pinch-zoomed pages report a different height; don't chase those
  if (vv.scale && vv.scale > 1.05) return { height: innerHeight, top: 0, keyboardOpen: false };
  return {
    height: Math.round(vv.height),
    top: Math.max(0, Math.round(vv.offsetTop)),
    keyboardOpen: innerHeight - vv.height > 120,
  };
}

/** Publishes --vvh (visible height), --vvt (visible top) and data-keyboard on <html>. Call once at the app root. */
export function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    const root = document.documentElement;
    const apply = () => {
      const v = computeViewportVars(vv, window.innerHeight);
      root.style.setProperty('--vvh', `${v.height}px`);
      root.style.setProperty('--vvt', `${v.top}px`);
      root.dataset.keyboard = v.keyboardOpen ? 'open' : 'closed';
    };
    apply();
    vv?.addEventListener('resize', apply);
    vv?.addEventListener('scroll', apply);
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', apply);
    return () => {
      vv?.removeEventListener('resize', apply);
      vv?.removeEventListener('scroll', apply);
      window.removeEventListener('resize', apply);
      window.removeEventListener('orientationchange', apply);
    };
  }, []);
}
