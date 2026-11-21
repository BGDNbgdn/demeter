import type { Food } from '../types';

/** "Chicken breast, raw (skinless)" → "Chicken breast, cooked (skinless)" */
export function cookedName(name: string): string {
  if (/,\s*(raw|dry)\b/i.test(name)) return name.replace(/,\s*(raw|dry)\b/i, ', cooked');
  if (/\bcooked\b/i.test(name)) return name;
  return `${name} (cooked)`;
}

/** Compact label for chips: drops "(skinless)" style qualifiers and trims long names. */
export function chipName(name: string, max = 28): string {
  const s = name.replace(/\s*\([^)]*\)/g, '').replace(/\s+,/g, ',').trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

export function shortName(name: string): string {
  return name.split(',')[0].trim();
}

/** A sensible starting weight for a food. */
export function defaultWeightFor(food: Food): number {
  const first = food.servings?.[0];
  if (first && first.grams <= 120 && /\b(egg|slice|bar|scoop|tbsp|tsp|cake|bun|bagel|tortilla|wrap|pita|date|apple|banana|kiwi|orange|biscuit|cookie|doughnut|muffin|waffle|roll)/i.test(first.label)) return first.grams;
  if (food.isLiquid) return 250;
  if (food.category === 'fat' || food.category === 'sauce') return 15;
  return 100;
}
