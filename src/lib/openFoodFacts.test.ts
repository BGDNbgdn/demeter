import { describe, expect, it } from 'vitest';
import { OffError, lookupBarcode, offToFoodPrefill, parseOffProduct } from './openFoodFacts';

describe('Open Food Facts parsing', () => {
  it('parses a normal product', () => {
    const p = parseOffProduct({
      code: '5000112637922', product_name: 'Cola', brands: 'Brand A, Brand B', serving_quantity: '330', serving_size: '330 ml',
      nutriments: { proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0, 'energy-kcal_100g': 42, fiber_100g: 0 },
    })!;
    expect(p.name).toBe('Cola');
    expect(p.brand).toBe('Brand A');
    expect(p.caloriesPer100g).toBe(42);
    expect(p.servingG).toBe(330);
    expect(offToFoodPrefill(p).nutritionBasis).toBe('as-packaged');
  });
  it('falls back to kJ when kcal is missing', () => {
    const p = parseOffProduct({ product_name: 'X', nutriments: { proteins_100g: '10', carbohydrates_100g: 20, fat_100g: 5, energy_100g: 1046 } })!;
    expect(p.caloriesPer100g).toBe(250);
    expect(p.proteinPer100g).toBe(10);
  });
  it('rejects products without usable nutrition', () => {
    expect(parseOffProduct({ product_name: 'Nothing', nutriments: {} })).toBeNull();
    expect(parseOffProduct({ nutriments: { proteins_100g: 1, 'energy-kcal_100g': 10 } })).toBeNull();
  });
  it('fails gracefully offline with a clear error (never throws a raw TypeError)', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new TypeError('Failed to fetch'))) as typeof fetch;
    await expect(lookupBarcode('5000112637922')).rejects.toBeInstanceOf(OffError);
    await expect(lookupBarcode('5000112637922')).rejects.toMatchObject({ kind: 'offline' });
    await expect(lookupBarcode('12')).rejects.toMatchObject({ kind: 'not-found' });
    globalThis.fetch = original;
  });
  it('reports unknown barcodes', async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(new Response(JSON.stringify({ status: 0 }), { status: 200 }))) as typeof fetch;
    await expect(lookupBarcode('0000000000000')).rejects.toMatchObject({ kind: 'not-found' });
    globalThis.fetch = original;
  });
});
