import { AddMenu } from '../features/today/AddMenu';
import { EntryEditSheet } from '../features/today/EntryEditSheet';
import { QuickAddSheet } from '../features/today/QuickAddSheet';
import { FoodDetailSheet } from '../features/foods/FoodDetailSheet';
import { FoodFormSheet } from '../features/foods/FoodFormSheet';
import { LogFoodSheet } from '../features/foods/LogFoodSheet';
import { SearchOverlay } from '../features/foods/SearchOverlay';
import { OffSheet } from '../features/openfoodfacts/OffSheet';
import { IntroSheet } from '../features/onboarding/IntroSheet';
import { LogRecipeSheet } from '../features/recipes/LogRecipeSheet';
import { TrashSheet } from '../features/settings/TrashSheet';
import { FridgeItemSheet } from '../features/kitchen/FridgeItemSheet';
import { PriceSheet } from '../features/kitchen/PriceSheet';
import { ScanSheet } from '../features/kitchen/ScanSheet';
import { RecipePicker } from '../features/recipes/RecipePicker';
import { ToastHost } from './ui/misc';

/** All app-wide sheets live here so any screen can open any of them. */
export function Overlays() {
  return (
    <>
      <AddMenu />
      <SearchOverlay />
      <LogFoodSheet />
      <LogRecipeSheet />
      <RecipePicker />
      <EntryEditSheet />
      <FoodDetailSheet />
      <FoodFormSheet />
      <QuickAddSheet />
      <OffSheet />
      <TrashSheet />
      <FridgeItemSheet />
      <ScanSheet />
      <PriceSheet />
      <IntroSheet />
      <ToastHost />
    </>
  );
}
