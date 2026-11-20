import { create } from 'zustand';
import { buildBackup, serializeBackup, backupFileName } from '../db/backup';
import { DEFAULT_TARGETS, defaultSettings } from '../db/defaults';
import * as repo from '../db/repo';
import { BUILTIN_FOODS } from '../data';
import { createFoodSearcher, type FoodSearcher } from '../lib/search';
import { newId } from '../utils/id';
import { todayStr } from '../utils/dates';
import type {
  AppSettings, DailyTargets, Food, FoodUsage, MealLogEntry, MealType, Recipe,
} from '../types';

export interface Toast {
  id: number;
  message: string;
  tone?: 'default' | 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

interface AppState {
  ready: boolean;
  loadError?: string;
  persisted: boolean | null;
  customFoods: Food[];
  allFoods: Food[];
  foodMap: Map<string, Food>;
  searcher: FoodSearcher;
  recipes: Recipe[];
  logs: MealLogEntry[];
  usage: Record<string, FoodUsage>;
  settings: AppSettings;
  targets: DailyTargets;
  selectedDate: string;
  toast: Toast | null;

  init(): Promise<void>;
  setSelectedDate(date: string): void;
  showToast(message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>): void;
  dismissToast(): void;

  addLog(entry: MealLogEntry): Promise<void>;
  updateLog(entry: MealLogEntry): Promise<void>;
  deleteLog(id: string): Promise<void>;

  saveFood(food: Food): Promise<void>;
  deleteFood(id: string): Promise<void>;
  toggleFavoriteFood(id: string): Promise<void>;
  saveRecipe(recipe: Recipe): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
  toggleFavoriteRecipe(id: string): Promise<void>;

  setTargets(t: DailyTargets): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  recordUsage(key: string, weightG: number, meal?: MealType): Promise<void>;

  exportJSON(): { text: string; fileName: string };
  markExported(): Promise<void>;
  importAll(data: repo.AllData): Promise<void>;
  eraseAll(): Promise<void>;
}

function mergeFoods(custom: Food[]) {
  // Custom foods first so they win ties in search; ids never collide with builtin ones.
  const allFoods = [...custom, ...BUILTIN_FOODS];
  return {
    customFoods: custom,
    allFoods,
    foodMap: new Map(allFoods.map(f => [f.id, f])),
    searcher: createFoodSearcher(allFoods),
  };
}

let toastSeq = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const initialFoods = mergeFoods([]);

export const useAppStore = create<AppState>((set, get) => {
  const guard = async (fn: () => Promise<void>, errMsg = 'Could not save to this device. Storage may be full or blocked.') => {
    try { await fn(); } catch (e) {
      console.error(e);
      get().showToast(errMsg, { tone: 'error' });
    }
  };

  return {
    ready: false,
    persisted: null,
    ...initialFoods,
    recipes: [],
    logs: [],
    usage: {},
    settings: defaultSettings(),
    targets: { ...DEFAULT_TARGETS },
    selectedDate: todayStr(),
    toast: null,

    async init() {
      if (get().ready) return;
      try {
        const data = await repo.loadAll();
        set({
          ...mergeFoods(data.foods),
          recipes: data.recipes,
          logs: data.logs,
          usage: Object.fromEntries(data.usage.map(u => [u.key, u])),
          settings: data.settings,
          targets: data.targets,
          ready: true,
        });
        // First run: persist the default settings so the DB is never "half empty".
        void repo.putSettings(data.settings).catch(() => {});
      } catch (e) {
        console.error(e);
        set({ ready: true, loadError: 'Could not open local storage. Private browsing or blocked site data can cause this.' });
      }
      // Ask the browser not to evict our data (best effort; Safari decides on its own heuristics).
      try {
        if (navigator.storage?.persist) {
          const already = await navigator.storage.persisted?.();
          const granted = already || (await navigator.storage.persist());
          set({ persisted: !!granted });
        }
      } catch { /* ignore */ }
    },

    setSelectedDate: date => set({ selectedDate: date }),

    showToast(message, opts = {}) {
      clearTimeout(toastTimer);
      const id = ++toastSeq;
      set({ toast: { id, message, ...opts } });
      toastTimer = setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, opts.onAction ? 6000 : 2800);
    },
    dismissToast: () => set({ toast: null }),

    // ---------------------------------------------------------------- logs
    async addLog(entry) {
      set(s => ({ logs: [...s.logs, entry] }));
      await guard(() => repo.putLog(entry));
    },
    async updateLog(entry) {
      const next = { ...entry, updatedAt: Date.now() };
      set(s => ({ logs: s.logs.map(l => (l.id === next.id ? next : l)) }));
      await guard(() => repo.putLog(next));
    },
    async deleteLog(id) {
      set(s => ({ logs: s.logs.filter(l => l.id !== id) }));
      await guard(() => repo.deleteLogById(id));
    },

    // ---------------------------------------------------------------- foods
    async saveFood(food) {
      const next = { ...food, updatedAt: Date.now() };
      const custom = get().customFoods;
      const exists = custom.some(f => f.id === next.id);
      set(mergeFoods(exists ? custom.map(f => (f.id === next.id ? next : f)) : [next, ...custom]));
      await guard(() => repo.putFood(next));
    },
    async deleteFood(id) {
      set(mergeFoods(get().customFoods.filter(f => f.id !== id)));
      await guard(() => repo.deleteFoodById(id));
      if (get().settings.favoriteFoodIds.includes(id)) {
        await get().updateSettings({ favoriteFoodIds: get().settings.favoriteFoodIds.filter(x => x !== id) });
      }
    },
    async toggleFavoriteFood(id) {
      const favs = get().settings.favoriteFoodIds;
      await get().updateSettings({ favoriteFoodIds: favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id] });
    },

    // ---------------------------------------------------------------- recipes
    async saveRecipe(recipe) {
      const next = { ...recipe, updatedAt: Date.now() };
      set(s => ({ recipes: s.recipes.some(r => r.id === next.id) ? s.recipes.map(r => (r.id === next.id ? next : r)) : [next, ...s.recipes] }));
      await guard(() => repo.putRecipe(next));
    },
    async deleteRecipe(id) {
      set(s => ({ recipes: s.recipes.filter(r => r.id !== id) }));
      await guard(() => repo.deleteRecipeById(id));
    },
    async toggleFavoriteRecipe(id) {
      const favs = get().settings.favoriteRecipeIds;
      await get().updateSettings({ favoriteRecipeIds: favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id] });
    },

    // ---------------------------------------------------------------- targets / settings / usage
    async setTargets(t) {
      set({ targets: t });
      await guard(() => repo.putTargets(t));
    },
    async updateSettings(patch) {
      const next = { ...get().settings, ...patch };
      set({ settings: next });
      await guard(() => repo.putSettings(next));
    },
    async recordUsage(key, weightG, meal) {
      const prev = get().usage[key];
      const next: FoodUsage = {
        key, count: (prev?.count ?? 0) + 1, lastUsedAt: Date.now(), lastWeightG: weightG, lastMealType: meal ?? prev?.lastMealType,
      };
      set(s => ({ usage: { ...s.usage, [key]: next } }));
      await guard(() => repo.putUsage(next));
    },

    // ---------------------------------------------------------------- backup
    exportJSON() {
      const s = get();
      const backup = buildBackup({
        foods: s.customFoods, recipes: s.recipes, logs: s.logs, usage: Object.values(s.usage),
        settings: s.settings, targets: s.targets,
      });
      return { text: serializeBackup(backup), fileName: backupFileName() };
    },
    async markExported() {
      await get().updateSettings({ lastExportAt: Date.now() });
    },
    async importAll(data) {
      await repo.replaceAll(data);
      set({
        ...mergeFoods(data.foods),
        recipes: data.recipes, logs: data.logs,
        usage: Object.fromEntries(data.usage.map(u => [u.key, u])),
        settings: data.settings, targets: data.targets,
      });
    },
    async eraseAll() {
      await repo.eraseEverything();
      const data = await repo.loadAll();
      set({
        ...mergeFoods([]),
        recipes: [], logs: [], usage: {}, settings: data.settings, targets: data.targets,
      });
    },
  };
});

export { newId };
