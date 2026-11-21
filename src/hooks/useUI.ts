import { create } from 'zustand';
import type { MealType } from '../types';

/** Ephemeral UI state: which sheets/overlays are open. Lets any screen open any sheet. */
interface UIState {
  searchOpen: boolean;
  addMenuOpen: boolean;
  logFood: { foodId: string; meal?: MealType; weightG?: number } | null;
  logRecipe: { recipeId: string; weightG?: number; meal?: MealType } | null;
  editEntryId: string | null;
  foodDetailId: string | null;
  foodForm: { foodId?: string; duplicate?: boolean; name?: string; prefill?: Partial<import('../types').Food>; logAfter?: boolean } | null;
  quickAddOpen: boolean;
  offOpen: boolean;
  recipePickerOpen: boolean;
  introOpen: boolean;
  trashOpen: boolean;
  /** "Scan groceries" sheet (continuous barcode scanning into My fridge). */
  scanOpen: boolean;
  /** Price sheet for this food. */
  priceFoodId: string | null;
  /** Fridge item detail sheet. */
  pantryItemId: string | null;
  open: (patch: Partial<Omit<UIState, 'open' | 'closeAll'>>) => void;
  closeAll: () => void;
}

const CLOSED = {
  searchOpen: false, addMenuOpen: false, logFood: null, logRecipe: null, editEntryId: null, foodDetailId: null,
  foodForm: null, quickAddOpen: false, offOpen: false, recipePickerOpen: false, introOpen: false, trashOpen: false,
  scanOpen: false, priceFoodId: null, pantryItemId: null,
};

export const useUI = create<UIState>(set => ({
  ...CLOSED,
  open: patch => set(patch),
  closeAll: () => set(CLOSED),
}));
