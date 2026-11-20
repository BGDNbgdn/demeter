import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/cn';
import { Icon, type IconName } from './Icon';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  block?: boolean;
  children?: ReactNode;
}

const VARIANTS = {
  primary: 'bg-accent text-accentink font-semibold active:opacity-80',
  secondary: 'bg-surface2 text-ink active:bg-surface3',
  ghost: 'bg-transparent text-accent active:bg-accentsoft',
  outline: 'bg-transparent text-ink border border-line active:bg-surface2',
  danger: 'bg-danger/15 text-danger font-semibold active:bg-danger/25',
};
const SIZES = {
  sm: 'h-9 px-3 text-[14px] rounded-xl gap-1.5',
  md: 'h-12 px-4 text-[16px] rounded-2xl gap-2',
  lg: 'h-14 px-5 text-[17px] rounded-2xl gap-2',
};

export function Button({ variant = 'secondary', size = 'md', icon, block, className, children, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-medium select-none transition-colors disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant], SIZES[size], block && 'w-full', className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={size === 'sm' ? 16 : 20} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, className, size = 44, filled, ...rest }: { icon: IconName; label: string; size?: number; filled?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cn('inline-flex items-center justify-center rounded-full text-ink active:bg-surface2 select-none disabled:opacity-40', className)}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon name={icon} filled={filled} />
    </button>
  );
}
