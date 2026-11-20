import { NavLink } from 'react-router-dom';
import { Icon, type IconName } from './ui/Icon';
import { cn } from '../utils/cn';

const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/foods', label: 'Foods', icon: 'foods' },
  { to: '/recipes', label: 'Recipes', icon: 'recipes' },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

export function BottomNav() {
  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 bg-surface/92 backdrop-blur-xl border-t border-line pb-safe" aria-label="Main">
      <ul className="mx-auto max-w-xl grid grid-cols-5">
        {TABS.map(t => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) => cn('flex flex-col items-center justify-center gap-0.5 h-[62px] text-[11px] font-medium select-none', isActive ? 'text-accent' : 'text-muted active:text-ink')}
            >
              {({ isActive }) => (<><Icon name={t.icon} size={24} strokeWidth={isActive ? 2.2 : 1.8} /><span>{t.label}</span></>)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
