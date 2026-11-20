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
}

export function FoodRow({ food, onClick, favorite, onToggleFavorite, onInfo, onAdd, className, sub }: Props) {
  return (
    <div className={cn('flex items-center border-b border-line/60 last:border-b-0', className)}>
      <button type="button" onClick={onClick} className="flex-1 min-w-0 text-left py-2.5 pl-1 pr-2 active:opacity-60">
        <div className="text-[16px] font-medium leading-snug line-clamp-2">{food.name}</div>
        <div className="flex items-center gap-1.5 text-[13px] text-muted min-w-0 mt-0.5">
          <BasisBadge basis={food.nutritionBasis} className="shrink-0" />
          <span className="truncate tabular">
            {sub ?? `${food.brand ? food.brand + ' · ' : ''}${fmtNum(food.caloriesPer100g, 0)} kcal · ${fmtNum(food.carbsPer100g, 1)} C · ${fmtNum(food.fatPer100g, 1)} F`}
          </span>
        </div>
      </button>
      <button type="button" onClick={onClick} tabIndex={-1} aria-hidden className="text-right pr-1 pl-1 py-2 shrink-0">
        <div className="text-[18px] font-bold text-protein tabular leading-none">{fmtNum(food.proteinPer100g, 1)}<span className="text-[11px] font-semibold ml-0.5">g</span></div>
        <div className="text-[10px] uppercase tracking-wider text-muted mt-0.5">protein</div>
      </button>
      {onToggleFavorite && (
        <button
          type="button" aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={favorite}
          onClick={onToggleFavorite}
          className={cn('h-11 w-11 shrink-0 flex items-center justify-center rounded-full active:bg-surface2', favorite ? 'text-accent' : 'text-muted/60')}
        >
          <Icon name="star" size={20} filled={favorite} />
        </button>
      )}
      {onAdd && (
        <button type="button" aria-label={`Log ${food.name}`} onClick={onAdd} className="h-10 w-10 shrink-0 mr-1 flex items-center justify-center rounded-full bg-accentsoft text-accent active:opacity-60">
          <Icon name="plus" size={20} strokeWidth={2.3} />
        </button>
      )}
      {onInfo && (
        <button type="button" aria-label="Details" onClick={onInfo} className="h-11 w-9 shrink-0 flex items-center justify-center text-muted/70 active:text-ink">
          <Icon name="info" size={19} />
        </button>
      )}
    </div>
  );
}
