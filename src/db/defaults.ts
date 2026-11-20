import type { AppSettings, DailyTargets } from '../types';

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
