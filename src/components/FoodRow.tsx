import type { ReactNode } from 'react';
import { fmtNum } from '../lib/engine';
import type { Food } from '../types';
import { cn } from '../utils/cn';
import { Icon } from './ui/Icon';
import { BasisBadge } from './ui/misc';

interface Props {
  food: Food;
  onClick?: () => void;
  favorite?: boolean;
  onToggleFavorite?: () => void;
  onInfo?: () => void;
  onAdd?: () => void;
  className?: string;
  sub?: string;
  /** Something before the name (a selection check, for instance). */
  leading?: ReactNode;
}

export function FoodRow({ food, onClick, favorite, onToggleFavorite, onInfo, onAdd, className, sub, leading }: Props) {
  return (
    <div className={cn('flex items-center gap-1 pl-4 pr-2 py-2.5 border-b border-line/70 last:border-b-0', className)}>
      {leading}
      <button type="button" onClick={onClick} className="flex-1 min-w-0 text-left py-0.5 pr-1 active:opacity-60">
        <div className="text-[16px] font-semibold leading-[1.2] line-clamp-2">{food.name}</div>
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-muted min-w-0 mt-1.5">
          <BasisBadge basis={food.nutritionBasis} className="shrink-0" />
          <span className="tabular">
            {sub ?? `${food.brand ? food.brand + ' · ' : ''}${fmtNum(food.caloriesPer100g, 0)} kcal · ${fmtNum(food.carbsPer100g, 1)} C · ${fmtNum(food.fatPer100g, 1)} F`}
          </span>
        </div>
      </button>
      <button type="button" onClick={onClick} tabIndex={-1} aria-hidden className="text-right pl-1 pr-1 shrink-0 whitespace-nowrap">
        <b className="text-[24px] font-bold tracking-[-0.02em] tabular">{fmtNum(food.proteinPer100g, 1)}</b><span className="text-[12px] font-semibold text-muted ml-0.5">g</span>
        <div className="text-[10px] uppercase tracking-wider text-muted -mt-0.5">protein</div>
      </button>
      {onToggleFavorite && (
        <button
          type="button" aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={favorite}
          onClick={onToggleFavorite}
          className={cn('h-11 w-11 shrink-0 flex items-center justify-center rounded-full active:bg-surface2', favorite ? 'text-[var(--carbs)]' : 'text-muted')}
        >
          <Icon name="star" size={20} filled={favorite} />
        </button>
      )}
      {onAdd && (
        <button type="button" aria-label={`Log ${food.name}`} onClick={onAdd} className="glass-btn h-11 w-11 shrink-0 flex items-center justify-center rounded-full active:opacity-60">
          <Icon name="plus" size={20} strokeWidth={2.3} />
        </button>
      )}
      {onInfo && (
        <button type="button" aria-label="Details" onClick={onInfo} className="h-11 w-9 shrink-0 flex items-center justify-center text-muted active:text-ink">
          <Icon name="info" size={19} />
        </button>
      )}
    </div>
  );
}
