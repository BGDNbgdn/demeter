import { NavLink, useLocation } from 'react-router-dom';
import { Icon, type IconName } from './ui/Icon';
import { cn } from '../utils/cn';

const TABS: Array<{ to: string; label: string; icon: IconName; /** other routes that highlight this tab */ also?: string[] }> = [
  { to: '/', label: 'Today', icon: 'today' },
  { to: '/foods', label: 'Foods', icon: 'foods' },
  { to: '/recipes', label: 'Recipes', icon: 'recipes' },
  { to: '/fridge', label: 'Kitchen', icon: 'fridge', also: ['/plan', '/shop', '/value'] },
  { to: '/history', label: 'History', icon: 'history', also: ['/review'] },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

/** Floating glass tab bar: the current tab is a white pill with its name, the others are bare icons. */
export function BottomNav() {
  const { pathname } = useLocation();
  return (
    <nav
      className="glass fixed inset-x-3 z-30 mx-auto max-w-[560px] h-[60px] rounded-[32px] p-1.5 flex items-center justify-between"
      style={{ bottom: 'calc(env(safe-area-inset-bottom) * 0.5 + 12px)' }}
      aria-label="Main"
    >
      {TABS.map(t => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.to === '/'}
          aria-label={t.label}
          className={({ isActive }) => {
            const on = isActive || !!t.also?.some(a => pathname === a || pathname.startsWith(`${a}/`));
            return cn('h-[46px] min-w-11 rounded-3xl flex items-center justify-center gap-1.5 text-[14px] font-bold select-none', on ? 'pill-on pl-3 pr-3.5' : 'text-muted active:text-ink');
          }}
        >
          {({ isActive }) => {
            const on = isActive || !!t.also?.some(a => pathname === a || pathname.startsWith(`${a}/`));
            return (<><Icon name={t.icon} size={20} strokeWidth={on ? 2.2 : 1.9} />{on && <span>{t.label}</span>}</>);
          }}
        </NavLink>
      ))}
    </nav>
  );
}
