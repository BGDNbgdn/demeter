import { describe, expect, it } from 'vitest';
import { computeViewportVars } from './useVisualViewport';

describe('visible viewport (iPhone keyboard)', () => {
  it('no keyboard: visible area = whole screen', () => {
    expect(computeViewportVars({ height: 844, offsetTop: 0, scale: 1 }, 844)).toEqual({ height: 844, top: 0, keyboardOpen: false });
  });
  it('keyboard open: the sheet is sized to what is left above the keyboard, and follows the pan', () => {
    expect(computeViewportVars({ height: 508, offsetTop: 0, scale: 1 }, 844)).toEqual({ height: 508, top: 0, keyboardOpen: true });
    expect(computeViewportVars({ height: 508, offsetTop: 96.4, scale: 1 }, 844)).toEqual({ height: 508, top: 96, keyboardOpen: true });
  });
  it('small browser-chrome changes are not a keyboard', () => {
    expect(computeViewportVars({ height: 800, offsetTop: 0, scale: 1 }, 844).keyboardOpen).toBe(false);
  });
  it('falls back when visualViewport is missing or the page is pinch-zoomed', () => {
    expect(computeViewportVars(null, 700)).toEqual({ height: 700, top: 0, keyboardOpen: false });
    expect(computeViewportVars({ height: 300, offsetTop: 40, scale: 2 }, 700)).toEqual({ height: 700, top: 0, keyboardOpen: false });
  });
});
