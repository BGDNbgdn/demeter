import type { AllData, AppSettings, DailyTargets } from '../types';

export const DEFAULT_TARGETS: DailyTargets = {
  calories: 2200,
  protein: 160,
  carbs: 220,
  fat: 70,
  fiber: 30,
};

export function defaultSettings(): AppSettings {
  return {
    units: 'g',
    theme: 'dark',
    favoriteFoodIds: [],
    favoriteRecipeIds: [],
    introSeen: false,
    onlineLookupEnabled: true,
    backupReminderDays: 14,
    createdAt: Date.now(),
  };
}

/** Fill in collections that older snapshots / backups did not have yet. */
export function normalizeAllData(d: Omit<AllData, 'pantry' | 'prices' | 'plan'> & Partial<Pick<AllData, 'pantry' | 'prices' | 'plan'>>): AllData {
  return { ...d, pantry: d.pantry ?? [], prices: d.prices ?? [], plan: d.plan ?? [] };
}
