import { useEffect } from 'react';
import { useAppStore } from './useAppStore';

const DARK_BG = '#0c1210';
const LIGHT_BG = '#f5f3ec';

/** Applies the theme preference to <html> + the iOS status-bar colour, and keeps a tiny hint for flash-free startup. */
export function useTheme() {
  const theme = useAppStore(s => s.settings.theme);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? DARK_BG : LIGHT_BG);
      try { localStorage.setItem('demeter-theme-hint', theme); } catch { /* storage may be blocked; purely cosmetic */ }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
