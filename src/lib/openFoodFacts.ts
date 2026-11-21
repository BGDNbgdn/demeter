/**
 * Optional Open Food Facts lookup (https://world.openfoodfacts.org, ODbL data).
 * Nothing in Demeter depends on this: it is only called when you tap "look up a packaged product",
 * and every failure path ends with "add it manually".
 */
import type { Food } from '../types';
import { parsePackGrams } from './openFoodFactsPack';

const BASE = 'https://world.openfoodfacts.org';
const FIELDS = 'code,product_name,brands,nutriments,serving_size,serving_quantity,quantity';

export type OffErrorKind = 'offline' | 'timeout' | 'http' | 'not-found' | 'incomplete' | 'parse';
export class OffError extends Error {
  constructor(public kind: OffErrorKind, message: string) { super(message); }
}

export interface OffProduct {
  code: string;
  name: string;
  brand?: string;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  caloriesPer100g: number;
  fiberPer100g?: number;
  servingG?: number;
  servingLabel?: string;
  /** Size of the whole pack in grams (from the "quantity" label), when readable. */
  packG?: number;
}

type Nutriments = Record<string, number | string | undefined>;
interface RawProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriments?: Nutriments;
  serving_size?: string;
  serving_quantity?: number | string;
  quantity?: string;
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/** Convert an Open Food Facts product record into Demeter's per-100 g shape. Returns null if nutrition is unusable. */
export function parseOffProduct(p: RawProduct): OffProduct | null {
  const n = p.nutriments ?? {};
  const name = (p.product_name ?? '').trim();
  const protein = num(n['proteins_100g']);
  const carbs = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  let kcal = num(n['energy-kcal_100g']);
  if (kcal === undefined) {
    const kj = num(n['energy_100g']);
    if (kj !== undefined) kcal = kj / 4.184;
  }
  if (!name || kcal === undefined || (protein === undefined && carbs === undefined && fat === undefined)) return null;
  const servingG = num(p.serving_quantity);
  const packG = parsePackGrams(p.quantity);
  return {
    code: String(p.code ?? ''),
    name,
    ...(p.brands ? { brand: p.brands.split(',')[0].trim() } : {}),
    proteinPer100g: protein ?? 0,
    carbsPer100g: carbs ?? 0,
    fatPer100g: fat ?? 0,
    caloriesPer100g: Math.round(kcal),
    ...(num(n['fiber_100g']) !== undefined ? { fiberPer100g: num(n['fiber_100g']) } : {}),
    ...(servingG && servingG > 0 ? { servingG, servingLabel: p.serving_size || `${servingG} g` } : {}),
    ...(packG ? { packG } : {}),
  };
}

async function request(url: string, timeoutMs = 9000): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new OffError('offline', 'You appear to be offline. Online lookup needs an internet connection.');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new OffError('http', `Open Food Facts returned an error (${res.status}).`);
    try { return await res.json(); } catch { throw new OffError('parse', 'Open Food Facts sent an unreadable response.'); }
  } catch (e) {
    if (e instanceof OffError) throw e;
    if ((e as Error).name === 'AbortError') throw new OffError('timeout', 'Open Food Facts took too long to respond.');
    throw new OffError('offline', 'Could not reach Open Food Facts. Check your connection.');
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupBarcode(code: string): Promise<OffProduct> {
  const clean = code.replace(/\D/g, '');
  if (clean.length < 6) throw new OffError('not-found', 'That does not look like a barcode.');
  const data = (await request(`${BASE}/api/v2/product/${clean}.json?fields=${FIELDS}`)) as { status?: number; product?: RawProduct };
  if (!data.product || data.status === 0) throw new OffError('not-found', 'No product found for that barcode.');
  const parsed = parseOffProduct({ ...data.product, code: clean });
  if (!parsed) throw new OffError('incomplete', 'The product exists but has no usable nutrition data. Add it manually.');
  return parsed;
}

export async function searchProducts(query: string): Promise<OffProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = (await request(`${BASE}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&fields=${FIELDS}`)) as { products?: RawProduct[] };
  return (data.products ?? []).map(parseOffProduct).filter((p): p is OffProduct => !!p);
}

/** Prefill for Demeter's food form. */
export function offToFoodPrefill(p: OffProduct): Partial<Food> {
  return {
    name: p.name, brand: p.brand, category: 'custom', nutritionBasis: 'as-packaged', source: 'imported',
    proteinPer100g: p.proteinPer100g, carbsPer100g: p.carbsPer100g, fatPer100g: p.fatPer100g, caloriesPer100g: p.caloriesPer100g,
    fiberPer100g: p.fiberPer100g, barcode: p.code,
    ...(p.servingG ? { servings: [{ label: p.servingLabel ?? `${p.servingG} g`, grams: p.servingG }] } : {}),
  };
}
