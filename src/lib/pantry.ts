/**
 * Turning a scanned barcode into something in the fridge.
 * Order: already in the fridge → a food you already have with that barcode → online lookup → "unidentified".
 * Offline or unknown barcodes never block scanning: the item is kept (with its barcode) and can be named later.
 */
import type { Food, PantryItem } from '../types';
import { OffError, type OffProduct } from './openFoodFacts';
import { normCode, pantryItemForBarcode } from './kitchen';

export type ScanOutcome =
  | { kind: 'already'; item: PantryItem }
  | { kind: 'known'; food: Food }
  | { kind: 'identified'; product: OffProduct }
  | { kind: 'unidentified'; reason: 'invalid' | 'disabled' | 'offline' | 'not-found' | 'incomplete' | 'error'; message: string };

export interface ScanDeps {
  pantry: PantryItem[];
  /** Foods the user can already log (custom + imported). */
  foods: Food[];
  lookup: (code: string) => Promise<OffProduct>;
  /** The "online lookup" setting. */
  lookupEnabled: boolean;
  online: boolean;
}

export async function resolveBarcode(rawCode: string, deps: ScanDeps): Promise<ScanOutcome> {
  const code = rawCode.replace(/\D/g, '');
  if (code.length < 6) return { kind: 'unidentified', reason: 'invalid', message: 'That does not look like a barcode.' };

  const existing = pantryItemForBarcode(deps.pantry, code);
  if (existing) return { kind: 'already', item: existing };

  const n = normCode(code);
  const known = deps.foods.find(f => !f.deletedAt && f.barcode && normCode(f.barcode) === n);
  if (known) return { kind: 'known', food: known };

  if (!deps.lookupEnabled) return { kind: 'unidentified', reason: 'disabled', message: 'Online lookup is turned off in Settings.' };
  if (!deps.online) return { kind: 'unidentified', reason: 'offline', message: 'Offline — saved the barcode, name it later.' };
  try {
    return { kind: 'identified', product: await deps.lookup(code) };
  } catch (e) {
    if (e instanceof OffError) {
      const reason = e.kind === 'not-found' ? 'not-found' : e.kind === 'incomplete' ? 'incomplete' : e.kind === 'offline' ? 'offline' : 'error';
      return { kind: 'unidentified', reason, message: e.message };
    }
    return { kind: 'unidentified', reason: 'error', message: 'The lookup failed.' };
  }
}
