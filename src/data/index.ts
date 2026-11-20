import type { Food } from '../types';

// Built-in food database: structured JSON files in src/data/foods/*.json
// (generated from USDA FoodData Central SR Legacy + a few labelled "typical label" manual entries;
//  see scripts/build-foods.mjs and README → "Updating the food database").
const modules = import.meta.glob('./foods/*.json', { eager: true, import: 'default' }) as Record<string, RawFood[]>;

type RawFood = Omit<Food, 'source' | 'createdAt' | 'updatedAt'>;

export const BUILTIN_FOODS: Food[] = Object.values(modules)
  .flat()
  .map(f => ({ ...f, source: 'builtin' as const, createdAt: 0, updatedAt: 0 }));
