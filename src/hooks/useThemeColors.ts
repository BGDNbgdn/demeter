import { useEffect, useState } from 'react';

const NAMES = ['protein', 'calories', 'text', 'muted', 'border', 'danger', 'surface-3', 'accent'] as const;
export type ThemeColors = Record<(typeof NAMES)[number], string>;

function read(): ThemeColors {
  const cs = getComputedStyle(document.documentElement);
  return Object.fromEntries(NAMES.map(n => [n, cs.getPropertyValue(`--${n}`).trim() || '#888'])) as ThemeColors;
}

/** Resolved CSS colour values (charts need real colours, not var()). Updates when the theme changes. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    setColors(read());
    return () => obs.disconnect();
  }, []);
  return colors;
}
