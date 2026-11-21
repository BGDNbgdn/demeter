import type { Food } from '../types';
import type { OffProduct } from './openFoodFacts';

/**
 * Parse a pack-size label such as "500 g", "1,5 kg", "2 x 125 g", "6 × 330 ml", "1 L" into grams.
 * Liquids count 1 ml = 1 g (good enough for a shopping list). Returns undefined when it can't be read.
 */
export function parsePackGrams(label: string | undefined | null): number | undefined {
  if (!label) return undefined;
  const s = label.toLowerCase().replace(/,/g, '.').replace(/\s+/g, ' ').trim();
  const unit = (n: number, u: string) => {
    if (u === 'kg') return n * 1000;
    if (u === 'g' || u === 'gr' || u === 'ml') return n;
    if (u === 'cl') return n * 10;
    if (u === 'dl') return n * 100;
    if (u === 'l') return n * 1000;
    return NaN;
  };
  const multi = s.match(/(\d+)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(kg|gr|g|ml|cl|dl|l)\b/);
  if (multi) { const g = Number(multi[1]) * unit(Number(multi[2]), multi[3]); return Number.isFinite(g) && g > 0 ? Math.round(g * 10) / 10 : undefined; }
  const single = s.match(/(\d+(?:\.\d+)?)\s*(kg|gr|g|ml|cl|dl|l)\b/);
  if (single) { const g = unit(Number(single[1]), single[2]); return Number.isFinite(g) && g > 0 ? Math.round(g * 10) / 10 : undefined; }
  return undefined;
}

/** A complete food record from a looked-up product (used when scanning groceries: no form, one step). */
export function foodFromOffProduct(p: OffProduct, id: string, now = Date.now()): Food {
  return {
    id, name: p.name, ...(p.brand ? { brand: p.brand } : {}), category: 'custom',
    proteinPer100g: p.proteinPer100g, carbsPer100g: p.carbsPer100g, fatPer100g: p.fatPer100g, caloriesPer100g: p.caloriesPer100g,
    ...(p.fiberPer100g !== undefined ? { fiberPer100g: p.fiberPer100g } : {}),
    isLiquid: false, nutritionBasis: 'as-packaged', source: 'imported', barcode: p.code,
    ...(p.servingG ? { servings: [{ label: p.servingLabel ?? `${p.servingG} g`, grams: p.servingG }] } : {}),
    createdAt: now, updatedAt: now,
  };
}
