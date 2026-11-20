import Fuse from 'fuse.js';
import type { Food, FoodCategory } from '../types';

/** Lowercase, strip accents/punctuation so "Açaí" matches "acai". */
export function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
}

interface Entry {
  food: Food;
  name: string;
  hay: string;
}

export interface FoodFilters {
  category?: FoodCategory | 'all';
  favoritesOnly?: boolean;
  favoriteIds?: Set<string>;
  /** minimum grams of protein per 100 kcal */
  minProteinPer100kcal?: number;
  maxCaloriesPer100g?: number;
  minProteinPer100g?: number;
}

export type FoodSort = 'relevance' | 'name' | 'protein' | 'proteinDensity' | 'calories';

export interface FoodSearcher {
  search(query: string, filters?: FoodFilters, sort?: FoodSort, limit?: number): Food[];
}

export function applyFilters(foods: Food[], f: FoodFilters = {}): Food[] {
  return foods.filter(food => {
    if (f.category && f.category !== 'all' && food.category !== f.category) return false;
    if (f.favoritesOnly && !f.favoriteIds?.has(food.id)) return false;
    if (f.minProteinPer100g != null && food.proteinPer100g < f.minProteinPer100g) return false;
    if (f.maxCaloriesPer100g != null && food.caloriesPer100g > f.maxCaloriesPer100g) return false;
    if (f.minProteinPer100kcal != null) {
      const dens = food.caloriesPer100g > 0 ? (food.proteinPer100g / food.caloriesPer100g) * 100 : 0;
      if (dens < f.minProteinPer100kcal) return false;
    }
    return true;
  });
}

export function proteinDensity(food: Food): number {
  return food.caloriesPer100g > 0 ? (food.proteinPer100g / food.caloriesPer100g) * 100 : 0;
}

export function sortFoods(foods: Food[], sort: FoodSort): Food[] {
  const out = [...foods];
  switch (sort) {
    case 'name': return out.sort((a, b) => a.name.localeCompare(b.name));
    case 'protein': return out.sort((a, b) => b.proteinPer100g - a.proteinPer100g);
    case 'proteinDensity': return out.sort((a, b) => proteinDensity(b) - proteinDensity(a));
    case 'calories': return out.sort((a, b) => a.caloriesPer100g - b.caloriesPer100g);
    default: return out;
  }
}

/**
 * Fast, typo-tolerant food search:
 *  1. every query token must appear (as a prefix of a word, or a substring) → ranked by where it matched
 *  2. if that finds few results, Fuse.js fuzzy matching fills in (handles "chiken", "brocoli", ...)
 */
export function createFoodSearcher(foods: Food[]): FoodSearcher {
  const entries: Entry[] = foods.map(food => {
    const name = normalize(food.name);
    const hay = normalize([food.name, food.brand ?? '', ...(food.aliases ?? []), food.category].join(' '));
    return { food, name, hay };
  });
  const fuse = new Fuse(entries, {
    keys: [{ name: 'name', weight: 0.7 }, { name: 'hay', weight: 0.3 }],
    threshold: 0.38,
    ignoreLocation: true,
    minMatchCharLength: 3,
    includeScore: true,
  });

  return {
    search(query, filters, sort = 'relevance', limit = 60) {
      const q = normalize(query);
      let results: Food[];
      if (!q) {
        results = foods;
      } else {
        const tokens = q.split(' ').filter(Boolean);
        const scored: Array<{ food: Food; score: number }> = [];
        for (const e of entries) {
          let score = 0;
          let ok = true;
          for (const t of tokens) {
            const nameWordStart = e.name.startsWith(t) ? 0 : e.name.includes(' ' + t) ? 1 : -1;
            if (nameWordStart >= 0) { score += nameWordStart; continue; }
            if (e.name.includes(t)) { score += 3; continue; }
            if (e.hay.includes(' ' + t) || e.hay.startsWith(t)) { score += 4; continue; }
            if (e.hay.includes(t)) { score += 6; continue; }
            ok = false; break;
          }
          if (ok) scored.push({ food: e.food, score: score + e.name.length / 100 });
        }
        scored.sort((a, b) => a.score - b.score);
        results = scored.map(s => s.food);
        if (results.length < 8) {
          const seen = new Set(results.map(f => f.id));
          for (const r of fuse.search(q, { limit: 30 })) {
            if (!seen.has(r.item.food.id)) results.push(r.item.food);
          }
        }
      }
      const filtered = applyFilters(results, filters);
      return (sort === 'relevance' ? filtered : sortFoods(filtered, sort)).slice(0, limit);
    },
  };
}
