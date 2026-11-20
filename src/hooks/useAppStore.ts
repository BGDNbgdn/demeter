import { create } from 'zustand';
import { buildBackup, serializeBackup, backupFileName } from '../db/backup';
import { DEFAULT_TARGETS, defaultSettings } from '../db/defaults';
import * as repo from '../db/repo';
import { BUILTIN_FOODS } from '../data';
import { createFoodSearcher, type FoodSearcher } from '../lib/search';
import { purgeExpired, splitLive } from '../lib/trash';
import { newId } from '../utils/id';
import { todayStr } from '../utils/dates';
import type {
  AllData, AppSettings, DailyTargets, Food, FoodUsage, MealLogEntry, MealType, Recipe, Snapshot, SyncErrorKind,
} from '../types';

export interface Toast {
  id: number;
  message: string;
  tone?: 'default' | 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

export interface SyncUiState {
  configured: boolean;
  repo?: string;
  status: 'idle' | 'syncing' | 'error' | 'offline';
  lastSyncAt?: number;
  error?: { kind: SyncErrorKind; message: string };
}

/** Hooks the sync module plugs into (kept here so the store never imports the sync module → no import cycle). */
export const syncHooks = {
  /** called after any local change that should reach the other devices */
  onChange: () => {},
  /** make the cloud copy match this device on the next sync (after import / restore) */
  markAuthoritative: async () => {},
  /** forget the GitHub connection (used by "erase all") */
  disconnect: async () => {},
};

export interface Trash { foods: Food[]; recipes: Recipe[]; logs: MealLogEntry[] }

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
  trash: Trash;
  usage: Record<string, FoodUsage>;
  settings: AppSettings;
  targets: DailyTargets;
  selectedDate: string;
  toast: Toast | null;
  restorePoint: Pick<Snapshot, 'createdAt' | 'reason'> | null;
  sync: SyncUiState;

  init(): Promise<void>;
  /** Replace in-memory state from a full data set (live + soft-deleted). */
  applyData(data: AllData): void;
  fullData(): AllData;
  setSelectedDate(date: string): void;
  showToast(message: string, opts?: Partial<Omit<Toast, 'id' | 'message'>>): void;
  dismissToast(): void;

  addLog(entry: MealLogEntry): Promise<void>;
  updateLog(entry: MealLogEntry): Promise<void>;
  deleteLog(id: string): Promise<void>;
  restoreLog(id: string): Promise<void>;

  saveFood(food: Food): Promise<void>;
  deleteFood(id: string): Promise<void>;
  restoreFood(id: string): Promise<void>;
  toggleFavoriteFood(id: string): Promise<void>;
  saveRecipe(recipe: Recipe): Promise<void>;
  deleteRecipe(id: string): Promise<void>;
  restoreRecipe(id: string): Promise<void>;
  toggleFavoriteRecipe(id: string): Promise<void>;

  setTargets(t: DailyTargets): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<void>;
  recordUsage(key: string, weightG: number, meal?: MealType): Promise<void>;

  exportJSON(): { text: string; fileName: string };
  markExported(): Promise<void>;
  importAll(data: AllData): Promise<void>;
  eraseAll(): Promise<void>;
  restoreFromRestorePoint(): Promise<void>;
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
const EMPTY_TRASH: Trash = { foods: [], recipes: [], logs: [] };

export const useAppStore = create<AppState>((set, get) => {
  const guard = async (fn: () => Promise<void>, errMsg = 'Could not save to this device. Storage may be full or blocked.') => {
    try { await fn(); syncHooks.onChange(); } catch (e) {
      console.error(e);
      get().showToast(errMsg, { tone: 'error' });
    }
  };
  const byId = <T extends { id: string }>(xs: T[], id: string) => xs.find(x => x.id === id);

  /** Take a restore point of everything currently on the device (live + trash). */
  const takeRestorePoint = async (reason: Snapshot['reason']) => {
    const snap: Snapshot = { id: 'restore-point', createdAt: Date.now(), reason, data: structuredClone(get().fullData()) };
    await repo.putSnapshot(snap);
    set({ restorePoint: { createdAt: snap.createdAt, reason } });
  };

  return {
    ready: false,
    persisted: null,
    ...initialFoods,
    recipes: [],
    logs: [],
    trash: EMPTY_TRASH,
    usage: {},
    settings: defaultSettings(),
    targets: { ...DEFAULT_TARGETS },
    selectedDate: todayStr(),
    toast: null,
    restorePoint: null,
    sync: { configured: false, status: 'idle' },

    applyData(data) {
      const foods = splitLive(data.foods); const recipes = splitLive(data.recipes); const logs = splitLive(data.logs);
      set({
        ...mergeFoods(foods.live),
        recipes: recipes.live.sort((a, b) => b.updatedAt - a.updatedAt),
        logs: logs.live,
        trash: { foods: foods.trash, recipes: recipes.trash, logs: logs.trash },
        usage: Object.fromEntries(data.usage.map(u => [u.key, u])),
        settings: data.settings,
        targets: data.targets,
      });
    },

    fullData() {
      const s = get();
      return {
        foods: [...s.customFoods, ...s.trash.foods],
        recipes: [...s.recipes, ...s.trash.recipes],
        logs: [...s.logs, ...s.trash.logs],
        usage: Object.values(s.usage),
        settings: s.settings,
        targets: s.targets,
      };
    },

    async init() {
      if (get().ready) return;
      try {
        let data = await repo.loadAll();
        // forget soft-deleted records past the retention window
        const purged = purgeExpired(data);
        if (purged.removed.foods.length + purged.removed.recipes.length + purged.removed.logs.length > 0) {
          data = purged.data;
          await Promise.all([
            ...purged.removed.foods.map(repo.deleteFoodById), ...purged.removed.recipes.map(repo.deleteRecipeById), ...purged.removed.logs.map(repo.deleteLogById),
          ]).catch(() => {});
        }
        get().applyData(data);
        const snap = await repo.getSnapshot().catch(() => undefined);
        set({ ready: true, restorePoint: snap ? { createdAt: snap.createdAt, reason: snap.reason } : null });
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
      toastTimer = setTimeout(() => { if (get().toast?.id === id) set({ toast: null }); }, opts.onAction ? 7000 : 2800);
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
      const cur = byId(get().logs, id); if (!cur) return;
      const gone = { ...cur, deletedAt: Date.now(), updatedAt: Date.now() };
      set(s => ({ logs: s.logs.filter(l => l.id !== id), trash: { ...s.trash, logs: [gone, ...s.trash.logs] } }));
      await guard(() => repo.putLog(gone));
    },
    async restoreLog(id) {
      const cur = byId(get().trash.logs, id); if (!cur) return;
      const { deletedAt: _d, ...rest } = cur; void _d;
      const back: MealLogEntry = { ...rest, updatedAt: Date.now() };
      set(s => ({ logs: [...s.logs, back], trash: { ...s.trash, logs: s.trash.logs.filter(l => l.id !== id) } }));
      await guard(() => repo.putLog(back));
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
      const cur = byId(get().customFoods, id); if (!cur) return;
      const gone = { ...cur, deletedAt: Date.now(), updatedAt: Date.now() };
      set(s => ({ ...mergeFoods(s.customFoods.filter(f => f.id !== id)), trash: { ...s.trash, foods: [gone, ...s.trash.foods] } }));
      await guard(() => repo.putFood(gone));
    },
    async restoreFood(id) {
      const cur = byId(get().trash.foods, id); if (!cur) return;
      const { deletedAt: _d, ...rest } = cur; void _d;
      const back: Food = { ...rest, updatedAt: Date.now() };
      set(s => ({ ...mergeFoods([back, ...s.customFoods]), trash: { ...s.trash, foods: s.trash.foods.filter(f => f.id !== id) } }));
      await guard(() => repo.putFood(back));
    },
    async toggleFavoriteFood(id) {
      const favs = get().settings.favoriteFoodIds;
      await get().updateSettings({ favoriteFoodIds: favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id], favoritesUpdatedAt: Date.now() });
    },

    // ---------------------------------------------------------------- recipes
    async saveRecipe(recipe) {
      const next = { ...recipe, updatedAt: Date.now() };
      set(s => ({ recipes: s.recipes.some(r => r.id === next.id) ? s.recipes.map(r => (r.id === next.id ? next : r)) : [next, ...s.recipes] }));
      await guard(() => repo.putRecipe(next));
    },
    async deleteRecipe(id) {
      const cur = byId(get().recipes, id); if (!cur) return;
      const gone = { ...cur, deletedAt: Date.now(), updatedAt: Date.now() };
      set(s => ({ recipes: s.recipes.filter(r => r.id !== id), trash: { ...s.trash, recipes: [gone, ...s.trash.recipes] } }));
      await guard(() => repo.putRecipe(gone));
    },
    async restoreRecipe(id) {
      const cur = byId(get().trash.recipes, id); if (!cur) return;
      const { deletedAt: _d, ...rest } = cur; void _d;
      const back: Recipe = { ...rest, updatedAt: Date.now() };
      set(s => ({ recipes: [back, ...s.recipes], trash: { ...s.trash, recipes: s.trash.recipes.filter(r => r.id !== id) } }));
      await guard(() => repo.putRecipe(back));
    },
    async toggleFavoriteRecipe(id) {
      const favs = get().settings.favoriteRecipeIds;
      await get().updateSettings({ favoriteRecipeIds: favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id], favoritesUpdatedAt: Date.now() });
    },

    // ---------------------------------------------------------------- targets / settings / usage
    async setTargets(t) {
      const cur = get().targets;
      // no-op when nothing really changed (defensive: a save must never trigger itself)
      if (cur.calories === t.calories && cur.protein === t.protein && cur.carbs === t.carbs && cur.fat === t.fat && (cur.fiber ?? 0) === (t.fiber ?? 0)) return;
      const next = { ...t, updatedAt: Date.now() };
      set({ targets: next });
      await guard(() => repo.putTargets(next));
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

    // ---------------------------------------------------------------- backup / restore point
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
      await takeRestorePoint('import');
      const now = Date.now();
      const next: AllData = { ...data, targets: { ...data.targets, updatedAt: now }, settings: { ...data.settings, favoritesUpdatedAt: now } };
      await repo.replaceAll(next);
      get().applyData(next);
      await syncHooks.markAuthoritative();
      syncHooks.onChange();
    },
    async eraseAll() {
      await takeRestorePoint('erase');
      await repo.eraseEverything();
      await syncHooks.disconnect(); // the cloud copy is left untouched; reconnect to bring it back
      get().applyData(await repo.loadAll());
    },
    async restoreFromRestorePoint() {
      const snap = await repo.getSnapshot();
      if (!snap) return;
      await takeRestorePoint('restore'); // swap: the data being replaced becomes the new restore point
      const now = Date.now();
      const next: AllData = { ...snap.data, targets: { ...snap.data.targets, updatedAt: now }, settings: { ...snap.data.settings, favoritesUpdatedAt: now } };
      await repo.replaceAll(next);
      get().applyData(next);
      await syncHooks.markAuthoritative();
      syncHooks.onChange();
    },
  };
});

export { newId };
