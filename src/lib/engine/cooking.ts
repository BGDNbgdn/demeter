/**
 * Raw ⇄ cooked conversion engine.
 *
 * Cooking changes a food's *weight* (water/fat lost or absorbed) but not the nutrients
 * in it, so nutrient density per 100 g scales with the weight ratio:
 *
 *   cookedPer100g = rawPer100g × rawWeightG / cookedWeightG
 *   rawPer100g    = cookedPer100g × cookedWeightG / rawWeightG
 *
 * Every function here is pure and keeps full float precision; rounding is for display only (see format.ts).
 */
import type { Macros, NutritionBasis } from '../../types';
import { fmtNum } from './format';
import { isPositive, scaleMacros } from './nutrition';

// ---------------------------------------------------------------- scalar formulas

/** cookedPer100g = rawPer100g × raw / cooked. Returns null for invalid weights (never divides by zero). */
export function rawToCookedPer100(rawPer100: number, rawWeightG: number, cookedWeightG: number): number | null {
  if (!Number.isFinite(rawPer100) || !isPositive(rawWeightG) || !isPositive(cookedWeightG)) return null;
  return (rawPer100 * rawWeightG) / cookedWeightG;
}

/** rawPer100g = cookedPer100g × cooked / raw. Returns null for invalid weights. */
export function cookedToRawPer100(cookedPer100: number, rawWeightG: number, cookedWeightG: number): number | null {
  if (!Number.isFinite(cookedPer100) || !isPositive(rawWeightG) || !isPositive(cookedWeightG)) return null;
  return (cookedPer100 * cookedWeightG) / rawWeightG;
}

export function convertMacrosRawToCooked(rawPer100: Macros, rawWeightG: number, cookedWeightG: number): Macros | null {
  if (!isPositive(rawWeightG) || !isPositive(cookedWeightG)) return null;
  return scaleMacros(rawPer100, rawWeightG / cookedWeightG);
}

export function convertMacrosCookedToRaw(cookedPer100: Macros, rawWeightG: number, cookedWeightG: number): Macros | null {
  if (!isPositive(rawWeightG) || !isPositive(cookedWeightG)) return null;
  return scaleMacros(cookedPer100, cookedWeightG / rawWeightG);
}

// ---------------------------------------------------------------- weight change

export type WeightDirection = 'loss' | 'gain' | 'none';

export interface CookingChange {
  rawWeightG: number;
  cookedWeightG: number;
  /** cooked − raw (negative when water/fat was lost). */
  weightChangeG: number;
  /** (raw − cooked) / raw × 100 — positive when the food lost weight. */
  lossPct: number;
  /** cooked / raw × 100 */
  retentionPct: number;
  direction: WeightDirection;
  /** raw / cooked — how much denser every nutrient per 100 g becomes. */
  densityFactor: number;
  /** (densityFactor − 1) × 100 — e.g. +25% for chicken that lost 20% of its weight. */
  densityChangePct: number;
}

export function cookingChange(rawWeightG: number, cookedWeightG: number): CookingChange | null {
  if (!isPositive(rawWeightG) || !isPositive(cookedWeightG)) return null;
  const weightChangeG = cookedWeightG - rawWeightG;
  const densityFactor = rawWeightG / cookedWeightG;
  const same = Math.abs(weightChangeG) < 1e-9;
  return {
    rawWeightG,
    cookedWeightG,
    weightChangeG: same ? 0 : weightChangeG,
    lossPct: same ? 0 : ((rawWeightG - cookedWeightG) / rawWeightG) * 100,
    retentionPct: (cookedWeightG / rawWeightG) * 100,
    direction: same ? 'none' : weightChangeG < 0 ? 'loss' : 'gain',
    densityFactor,
    densityChangePct: same ? 0 : (densityFactor - 1) * 100,
  };
}

// ---------------------------------------------------------------- resolver

export type IssueCode =
  | 'invalid-raw-weight'
  | 'invalid-cooked-weight'
  | 'missing-weights'
  | 'missing-raw-weight'
  | 'cooked-heavier'
  | 'estimated-raw'
  | 'extreme-loss'
  | 'tiny-weight';

export interface Issue {
  code: IssueCode;
  message: string;
}

export type CookingStatus =
  /** Only raw info supplied: no cooking adjustment, cooked density = raw density. */
  | 'raw-only'
  /** Raw + cooked weights known: densities converted. */
  | 'converted'
  /** Nutrition is already per 100 g cooked (and no raw weight to convert back). */
  | 'cooked-only'
  /** Raw weight was estimated from the cooked weight using a typical retention %. */
  | 'estimated-raw'
  | 'invalid';

export interface CookingInput {
  /** What `per100g` describes. 'as-packaged' is treated like 'raw' (the state it is weighed in before cooking). */
  basis: NutritionBasis;
  per100g: Macros;
  rawWeightG?: number | null;
  cookedWeightG?: number | null;
  /** Typical cooked weight as % of raw (e.g. 75 for chicken). Used only when raw weight is missing. */
  defaultRetentionPercent?: number | null;
  /** Short name used in the explanation sentence, e.g. "Chicken". */
  label?: string;
}

export interface CookingResult {
  status: CookingStatus;
  rawWeightG: number | null;
  cookedWeightG: number | null;
  change: CookingChange | null;
  per100Raw: Macros | null;
  per100Cooked: Macros | null;
  warnings: Issue[];
  errors: Issue[];
  /** Plain-English one/two sentence explanation (empty when nothing to explain). */
  explanation: string;
}

const provided = (n: number | null | undefined): n is number => n !== null && n !== undefined;

export function resolveCooking(input: CookingInput): CookingResult {
  const { basis, per100g, defaultRetentionPercent, label } = input;
  const warnings: Issue[] = [];
  const errors: Issue[] = [];
  const cookedBasis = basis === 'cooked';

  let raw = input.rawWeightG;
  let cooked = input.cookedWeightG;

  const result = (partial: Partial<CookingResult> & Pick<CookingResult, 'status'>): CookingResult => ({
    rawWeightG: null,
    cookedWeightG: null,
    change: null,
    per100Raw: cookedBasis ? null : per100g,
    per100Cooked: cookedBasis ? per100g : null,
    warnings,
    errors,
    explanation: '',
    ...partial,
  });

  // ---- validate whatever was provided
  if (provided(raw) && !isPositive(raw)) {
    errors.push({ code: 'invalid-raw-weight', message: 'Raw weight must be a number greater than 0.' });
  }
  if (provided(cooked) && !isPositive(cooked)) {
    errors.push({
      code: 'invalid-cooked-weight',
      message: 'Cooked weight must be a number greater than 0 (it is used as the divisor, so 0 is not possible).',
    });
  }
  if (errors.length) return result({ status: 'invalid', per100Raw: cookedBasis ? null : per100g, per100Cooked: cookedBasis ? per100g : null });

  const rawOk = provided(raw);
  const cookedOk = provided(cooked);

  // ---- nutrition already per 100 g cooked
  if (cookedBasis) {
    if (rawOk && cookedOk) {
      const change = cookingChange(raw!, cooked!)!;
      const per100Raw = convertMacrosCookedToRaw(per100g, raw!, cooked!)!;
      pushWeightWarnings(warnings, change);
      return result({
        status: 'converted',
        rawWeightG: raw!, cookedWeightG: cooked!, change, per100Raw, per100Cooked: per100g, warnings,
        explanation: explainCooking({ label, change, per100Raw, per100Cooked: per100g }),
      });
    }
    return result({ status: 'cooked-only', rawWeightG: rawOk ? raw! : null, cookedWeightG: cookedOk ? cooked! : null, per100Raw: null, per100Cooked: per100g });
  }

  // ---- nutrition per 100 g raw / as-packaged
  if (rawOk && cookedOk) {
    const change = cookingChange(raw!, cooked!)!;
    const per100Cooked = convertMacrosRawToCooked(per100g, raw!, cooked!)!;
    pushWeightWarnings(warnings, change);
    return result({
      status: 'converted',
      rawWeightG: raw!, cookedWeightG: cooked!, change, per100Raw: per100g, per100Cooked, warnings,
      explanation: explainCooking({ label, change, per100Raw: per100g, per100Cooked }),
    });
  }

  if (rawOk && !cookedOk) {
    return result({ status: 'raw-only', rawWeightG: raw!, cookedWeightG: null, per100Raw: per100g, per100Cooked: per100g });
  }

  if (!rawOk && cookedOk) {
    if (isPositive(defaultRetentionPercent)) {
      // estimate: raw = cooked / retention
      raw = cooked! / (defaultRetentionPercent / 100);
      const change = cookingChange(raw, cooked!)!;
      const per100Cooked = convertMacrosRawToCooked(per100g, raw, cooked!)!;
      warnings.push({
        code: 'estimated-raw',
        message: `Raw weight estimated at ${fmtNum(raw, 0)} g using a typical cooked yield of ${fmtNum(defaultRetentionPercent, 0)}%. Enter the real raw weight for exact numbers.`,
      });
      pushWeightWarnings(warnings, change);
      return result({
        status: 'estimated-raw',
        rawWeightG: raw, cookedWeightG: cooked!, change, per100Raw: per100g, per100Cooked, warnings,
        explanation: explainCooking({ label, change, per100Raw: per100g, per100Cooked }),
      });
    }
    errors.push({
      code: 'missing-raw-weight',
      message: 'Enter the raw weight to convert (no typical cooked yield is known for this food).',
    });
    return result({ status: 'invalid', cookedWeightG: cooked!, per100Raw: per100g, per100Cooked: null });
  }

  errors.push({ code: 'missing-weights', message: 'Enter a raw weight (and a cooked weight after cooking).' });
  return result({ status: 'invalid' });
}

function pushWeightWarnings(warnings: Issue[], change: CookingChange) {
  if (change.direction === 'gain') {
    warnings.push({
      code: 'cooked-heavier',
      message: `Cooked weight is ${fmtNum(change.retentionPct - 100, 0)}% higher than raw. That is normal if the food absorbed water or oil (rice, pasta, oats, legumes) — otherwise double-check the weights.`,
    });
  }
  if (change.retentionPct < 10) {
    warnings.push({
      code: 'extreme-loss',
      message: `Cooked weight is only ${fmtNum(change.retentionPct, 1)}% of the raw weight — double-check both numbers.`,
    });
  }
  if (change.rawWeightG < 1 || change.cookedWeightG < 1) {
    warnings.push({ code: 'tiny-weight', message: 'Very small weight — values are rounded for display only; calculations stay exact.' });
  }
}

// ---------------------------------------------------------------- explanation text

export interface ExplainInput {
  label?: string;
  change: CookingChange;
  per100Raw: Macros;
  per100Cooked: Macros;
}

/**
 * "Chicken lost 20% of its weight during cooking. Protein density increased from 20 g to 25 g per 100 g."
 */
export function explainCooking({ label, change, per100Raw, per100Cooked }: ExplainInput): string {
  const subject = label?.trim() || 'The food';
  const from = fmtNum(per100Raw.protein, 1);
  const to = fmtNum(per100Cooked.protein, 1);
  if (change.direction === 'none') {
    return `${subject} did not change weight during cooking, so nutrition per 100 g stays the same (${to} g protein).`;
  }
  if (change.direction === 'loss') {
    return `${subject} lost ${fmtNum(change.lossPct, 1)}% of its weight during cooking. Protein density increased from ${from} g to ${to} g per 100 g.`;
  }
  return `${subject} gained ${fmtNum(-change.lossPct, 1)}% weight during cooking (it absorbed water or oil). Protein density decreased from ${from} g to ${to} g per 100 g.`;
}

/** Calories sentence to pair with `explainCooking` in detail views. */
export function explainCaloriesChange(per100Raw: Macros, per100Cooked: Macros): string {
  const a = fmtNum(per100Raw.calories, 1);
  const b = fmtNum(per100Cooked.calories, 1);
  if (a === b) return `Calories stay at ${b} kcal per 100 g.`;
  return `Calories ${per100Cooked.calories > per100Raw.calories ? 'rose' : 'fell'} from ${a} to ${b} kcal per 100 g.`;
}
