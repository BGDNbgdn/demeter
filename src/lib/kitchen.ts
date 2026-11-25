/**
 * "My fridge", the weekly plan and the shopping list. Pure functions, no I/O.
 *
 * The idea: the plan says what you need (raw grams, from your recipes' raw ingredient weights),
 * the fridge says what you already have, and the shopping list is the difference.
 */
import type { Food, FoodCategory, FoodPrice, Macros, PantryItem, PlanLine, Recipe } from '../types';
import { addMacros, foodPer100, nutritionForWeight, scaleMacros, ZERO_MACROS } from './engine';
import { costOfGrams, isLivePrice, recipeCost } from './cost';
import { daysBetween, startOfWeek, toDateStr, formatShort } from '../utils/dates';

export const normName = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
/** Barcodes: UPC-A (12) and EAN-13 (13, leading 0) are the same product. */
export const normCode = (c: string) => c.replace(/\D/g, '').replace(/^0+/, '');

export const weekStart = (date: string) => startOfWeek(date);

// ------------------------------------------------------------------ fridge
export const liveItems = (items: PantryItem[]) => items.filter(i => !i.deletedAt);

export function pantryItemForFood(pantry: PantryItem[], foodId: string): PantryItem | undefined {
  return pantry.find(i => !i.deletedAt && i.foodId === foodId);
}
export function pantryItemForBarcode(pantry: PantryItem[], code: string): PantryItem | undefined {
  const c = normCode(code);
  return c ? pantry.find(i => !i.deletedAt && i.barcode && normCode(i.barcode) === c) : undefined;
}

export interface Have { grams: number; unknown: boolean }

/** What the fridge holds per food (or per name for items without a food). `unknown` = at least one item with no amount. */
export function haveByKey(pantry: PantryItem[]): Map<string, Have> {
  const m = new Map<string, Have>();
  for (const i of pantry) {
    if (i.deletedAt) continue;
    const key = i.foodId ?? `name:${normName(i.name)}`;
    const h = m.get(key) ?? { grams: 0, unknown: false };
    if (typeof i.amountG === 'number') h.grams += i.amountG; else h.unknown = true;
    m.set(key, h);
  }
  return m;
}

// ------------------------------------------------------------------ plan
export interface PlanSpec { recipeId?: string; foodId?: string; name: string; batches?: number; grams?: number }

/** Adding something that is already in this week's plan increases it instead of creating a duplicate line. */
export function upsertPlanLine(existing: PlanLine[], week: string, spec: PlanSpec, now: number, newId: () => string): PlanLine {
  const same = existing.find(l => !l.deletedAt && l.week === week && (spec.recipeId ? l.recipeId === spec.recipeId : !l.recipeId && l.foodId === spec.foodId));
  if (same) {
    return spec.recipeId
      ? { ...same, batches: (same.batches ?? 1) + (spec.batches ?? 1), updatedAt: now }
      : { ...same, grams: (same.grams ?? 0) + (spec.grams ?? 0), updatedAt: now };
  }
  return {
    id: newId(), week, name: spec.name,
    ...(spec.recipeId ? { recipeId: spec.recipeId, batches: spec.batches ?? 1 } : { foodId: spec.foodId, grams: spec.grams ?? 100 }),
    createdAt: now, updatedAt: now,
  };
}

/** Lines of `from` that are not already in `to` (so "copy last week" can be tapped twice safely). */
export function linesToCopy(lines: PlanLine[], from: string, to: string): PlanLine[] {
  const live = lines.filter(l => !l.deletedAt);
  const has = (l: PlanLine) => live.some(x => x.week === to && (l.recipeId ? x.recipeId === l.recipeId : !x.recipeId && x.foodId === l.foodId));
  return live.filter(l => l.week === from && !has(l));
}

export interface PlanLineInfo {
  line: PlanLine;
  kind: 'recipe' | 'food';
  name: string;
  /** Nutrition for everything on this line (all batches / all grams). null when the recipe or food no longer exists. */
  macros: Macros | null;
  missing: boolean;
  /** Estimated cost of the priced part; `complete` is false when some ingredients have no price. */
  cost: number | null;
  costComplete: boolean;
}

export interface PlanLookups {
  recipeOf: (id: string) => Recipe | undefined;
  foodOf: (id: string) => Food | undefined;
  priceOf: (foodId: string) => FoodPrice | undefined;
}

export function describePlan(lines: PlanLine[], look: PlanLookups): { rows: PlanLineInfo[]; totals: Macros; cost: number; costComplete: boolean } {
  const rows: PlanLineInfo[] = [];
  let totals: Macros = { ...ZERO_MACROS };
  let cost = 0; let complete = true;
  for (const line of lines) {
    if (line.deletedAt) continue;
    if (line.recipeId) {
      const r = look.recipeOf(line.recipeId);
      if (!r) { rows.push({ line, kind: 'recipe', name: line.name, macros: null, missing: true, cost: null, costComplete: false }); complete = false; continue; }
      const batches = line.batches ?? 1;
      const macros = scaleMacros(r.totals, batches);
      const c = recipeCost(r, look.priceOf, batches);
      totals = addMacros(totals, macros);
      if (c.priced > 0) cost += c.total;
      if (c.missing.length > 0) complete = false;
      rows.push({ line, kind: 'recipe', name: r.name, macros, missing: false, cost: c.priced > 0 ? c.total : null, costComplete: c.missing.length === 0 });
    } else {
      const f = line.foodId ? look.foodOf(line.foodId) : undefined;
      if (!f) { rows.push({ line, kind: 'food', name: line.name, macros: null, missing: true, cost: null, costComplete: false }); complete = false; continue; }
      const macros = nutritionForWeight(foodPer100(f), line.grams ?? 0);
      const p = look.priceOf(f.id);
      const c = isLivePrice(p) ? costOfGrams(p, line.grams ?? 0) : null;
      totals = addMacros(totals, macros);
      if (c != null) cost += c; else complete = false;
      rows.push({ line, kind: 'food', name: f.name, macros, missing: false, cost: c, costComplete: c != null });
    }
  }
  return { rows, totals, cost, costComplete: complete };
}

// ------------------------------------------------------------------ shopping list
export interface ShopRow {
  key: string;
  foodId?: string;
  name: string;
  category: FoodCategory;
  needG: number;
  /** Known grams in the fridge. */
  haveG: number;
  /** The fridge has this, amount not recorded → counted as enough. */
  haveUnknown: boolean;
  buyG: number;
  covered: boolean;
  /** Pack size and number of packs, when a price with a pack size is known. */
  packG?: number;
  packs?: number;
  /** Estimated cost of what is left to buy (whole packs when the pack size is known). */
  cost?: number;
  /** Plan lines that need it. */
  from: string[];
}

export interface ShoppingList {
  buy: ShopRow[];
  have: ShopRow[];
  /** Plan lines whose recipe/food no longer exists (they can't contribute). */
  skipped: string[];
  estCost: number;
  /** Items to buy that have no price (the estimate leaves them out). */
  unpriced: number;
}

export const CATEGORY_ORDER: FoodCategory[] = ['protein', 'dairy', 'vegetable', 'fruit', 'carb', 'fat', 'sauce', 'beverage', 'supplement', 'snack', 'other', 'custom'];
const catRank = (c: FoodCategory) => { const i = CATEGORY_ORDER.indexOf(c); return i < 0 ? CATEGORY_ORDER.length : i; };

export function buildShoppingList(lines: PlanLine[], pantry: PantryItem[], look: PlanLookups): ShoppingList {
  const need = new Map<string, ShopRow>();
  const skipped: string[] = [];
  const add = (key: string, name: string, foodId: string | undefined, category: FoodCategory, grams: number, from: string) => {
    if (!(grams > 0)) return;
    const row = need.get(key) ?? { key, foodId, name, category, needG: 0, haveG: 0, haveUnknown: false, buyG: 0, covered: false, from: [] };
    row.needG += grams;
    if (!row.from.includes(from)) row.from.push(from);
    need.set(key, row);
  };

  for (const line of lines) {
    if (line.deletedAt) continue;
    if (line.recipeId) {
      const r = look.recipeOf(line.recipeId);
      if (!r) { skipped.push(line.name); continue; }
      const batches = line.batches ?? 1;
      for (const ing of r.ingredients) {
        const f = ing.foodId ? look.foodOf(ing.foodId) : undefined;
        add(ing.foodId ?? `name:${normName(ing.name)}`, f?.name ?? ing.name, ing.foodId, f?.category ?? 'other', ing.rawWeightG * batches, r.name);
      }
    } else {
      const f = line.foodId ? look.foodOf(line.foodId) : undefined;
      if (!f) { skipped.push(line.name); continue; }
      add(f.id, f.name, f.id, f.category, line.grams ?? 0, 'Extra');
    }
  }

  const have = haveByKey(pantry);
  const buy: ShopRow[] = []; const covered: ShopRow[] = [];
  let estCost = 0; let unpriced = 0;
  for (const row of need.values()) {
    const h = have.get(row.key);
    row.haveG = h?.grams ?? 0;
    row.haveUnknown = !!h?.unknown;
    row.covered = row.haveUnknown || row.haveG + 1e-6 >= row.needG;
    row.buyG = row.covered ? 0 : Math.max(0, row.needG - row.haveG);
    if (row.covered) { covered.push(row); continue; }
    const price = row.foodId ? look.priceOf(row.foodId) : undefined;
    if (isLivePrice(price)) {
      row.packG = price.packG;
      row.packs = Math.max(1, Math.ceil(row.buyG / price.packG - 1e-9));
      row.cost = row.packs * price.packPrice;
      estCost += row.cost;
    } else unpriced++;
    buy.push(row);
  }
  const order = (a: ShopRow, b: ShopRow) => catRank(a.category) - catRank(b.category) || a.name.localeCompare(b.name);
  return { buy: buy.sort(order), have: covered.sort(order), skipped, estCost, unpriced };
}

/** Plain-text list for sharing / pasting into Notes. */
export function shoppingText(list: ShoppingList, title: string, fmtG: (g: number) => string): string {
  const lines = [title, ''];
  for (const r of list.buy) {
    const pack = r.packs && r.packG ? ` (${r.packs} × ${fmtG(r.packG)})` : '';
    lines.push(`☐ ${r.name} — ${fmtG(r.buyG)}${pack}`);
  }
  if (list.buy.length === 0) lines.push('Nothing to buy — everything is in the fridge.');
  return lines.join('\n');
}

/** 450 → "450 g", 2400 → "2.4 kg". */
export function fmtWeight(g: number): string {
  if (g >= 1000) return `${Math.round((g / 1000) * 100) / 100} kg`;
  return `${Math.round(g)} g`;
}

// ------------------------------------------------------------------ when was it bought?
/** Day the item was bought (items from before this existed fall back to the day they were added). */
export function boughtDate(item: Pick<PantryItem, 'boughtAt' | 'createdAt'>): string {
  return item.boughtAt ?? toDateStr(new Date(item.createdAt));
}

/** Whole days since it was bought (0 = today). Never negative. */
export function ageInDays(item: Pick<PantryItem, 'boughtAt' | 'createdAt'>, today: string): number {
  return Math.max(0, daysBetween(boughtDate(item), today));
}

/** "Bought today", "Bought yesterday", "Bought 5 days ago", and a date once it is more than a month. */
export function boughtLabel(item: Pick<PantryItem, 'boughtAt' | 'createdAt'>, today: string): string {
  const d = ageInDays(item, today);
  if (d === 0) return 'Bought today';
  if (d === 1) return 'Bought yesterday';
  if (d <= 30) return `Bought ${d} days ago`;
  return `Bought ${formatShort(boughtDate(item))}`;
}

/** Oldest first (the thing to use up first), then by name. */
export function byOldest(a: PantryItem, b: PantryItem): number {
  return boughtDate(a).localeCompare(boughtDate(b)) || a.name.localeCompare(b.name);
}
