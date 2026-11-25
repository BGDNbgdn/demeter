import { create } from 'zustand';
import { buildBackup, serializeBackup, backupFileName } from '../db/backup';
import { DEFAULT_TARGETS, defaultSettings, normalizeAllData } from '../db/defaults';
import * as repo from '../db/repo';
import { BUILTIN_FOODS } from '../data';
import { createFoodSearcher, type FoodSearcher } from '../lib/search';
import { purgeExpired, splitLive } from '../lib/trash';
import { newId } from '../utils/id';
import { todayStr } from '../utils/dates';
import { linesToCopy, pantryItemForFood, upsertPlanLine, type PlanSpec } from '../lib/kitchen';
import type {
  AllData, AppSettings, DailyTargets, Food, FoodPrice, FoodUsage, MealLogEntry, MealType, PantryItem, PlanLine, Recipe, Snapshot, SyncErrorKind,
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

export interface Trash { foods: Food[]; recipes: Recipe[]; logs: MealLogEntry[]; pantry: PantryItem[]; prices: FoodPrice[]; plan: PlanLine[] }

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
  /** My fridge (live items). Items taken out stay in `trash.pantry` for a while — they power "ran out recently". */
  pantry: PantryItem[];
  /** Live prices by food id. */
  prices: Record<string, FoodPrice>;
  /** Weekly plan lines (all weeks, live). */
  plan: PlanLine[];
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

  /** Put a food in the fridge (or bring back one that ran out). `existed` is true if it was already there. */
  addFoodToFridge(food: Food, extra?: Partial<Pick<PantryItem, 'packG' | 'amountG' | 'barcode'>>): Promise<{ item: PantryItem; existed: boolean }>;
  /** A scanned barcode we could not identify (yet): keep it so it can be named later. */
  addUnidentifiedToFridge(barcode: string, name?: string): Promise<PantryItem>;
  savePantryItem(item: PantryItem): Promise<void>;
  removePantryItem(id: string): Promise<void>;
  restorePantryItem(id: string): Promise<void>;
  savePrice(foodId: string, packPrice: number, packG: number): Promise<void>;
  deletePrice(foodId: string): Promise<void>;
  addToPlan(week: string, spec: PlanSpec): Promise<PlanLine>;
  savePlanLine(line: PlanLine): Promise<void>;
  removePlanLine(id: string): Promise<void>;
  restorePlanLine(id: string): Promise<void>;
  /** Copy last week's lines into `to` (skipping what is already there). Returns how many were added. */
  copyPlanWeek(from: string, to: string): Promise<number>;

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
const EMPTY_TRASH: Trash = { foods: [], recipes: [], logs: [], pantry: [], prices: [], plan: [] };

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
    pantry: [],
    prices: {},
    plan: [],
    usage: {},
    settings: defaultSettings(),
    targets: { ...DEFAULT_TARGETS },
    selectedDate: todayStr(),
    toast: null,
    restorePoint: null,
    sync: { configured: false, status: 'idle' },

    applyData(data) {
      const foods = splitLive(data.foods); const recipes = splitLive(data.recipes); const logs = splitLive(data.logs);
      const pantry = splitLive(data.pantry); const prices = splitLive(data.prices); const plan = splitLive(data.plan);
      set({
        ...mergeFoods(foods.live),
        recipes: recipes.live.sort((a, b) => b.updatedAt - a.updatedAt),
        logs: logs.live,
        trash: { foods: foods.trash, recipes: recipes.trash, logs: logs.trash, pantry: pantry.trash, prices: prices.trash, plan: plan.trash },
        pantry: pantry.live.sort((a, b) => b.createdAt - a.createdAt),
        prices: Object.fromEntries(prices.live.map(p => [p.foodId, p])),
        plan: plan.live,
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
        pantry: [...s.pantry, ...s.trash.pantry],
        prices: [...Object.values(s.prices), ...s.trash.prices],
        plan: [...s.plan, ...s.trash.plan],
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
        const rm = purged.removed;
        if (rm.foods.length + rm.recipes.length + rm.logs.length + rm.pantry.length + rm.prices.length + rm.plan.length > 0) {
          data = purged.data;
          await Promise.all([
            ...rm.foods.map(repo.deleteFoodById), ...rm.recipes.map(repo.deleteRecipeById), ...rm.logs.map(repo.deleteLogById),
            ...rm.pantry.map(repo.deletePantryById), ...rm.prices.map(repo.deletePriceById), ...rm.plan.map(repo.deletePlanLineById),
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

    // ---------------------------------------------------------------- my fridge
    async addFoodToFridge(food, extra = {}) {
      const have = pantryItemForFood(get().pantry, food.id);
      if (have) return { item: have, existed: true };
      const now = Date.now();
      const gone = get().trash.pantry.filter(i => i.foodId === food.id).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      let item: PantryItem;
      if (gone) {
        // it ran out and is back: reuse the record (keeps barcode & pack size); the old amount is no longer valid
        const { deletedAt: _d, amountG: _a, ...rest } = gone; void _d; void _a;
        item = { ...rest, ...extra, boughtAt: todayStr(), updatedAt: now };
      } else {
        item = {
          id: newId('pan'), foodId: food.id, name: food.name, ...(food.brand ? { brand: food.brand } : {}),
          ...(food.barcode ? { barcode: food.barcode } : {}), ...extra, boughtAt: todayStr(), createdAt: now, updatedAt: now,
        };
      }
      set(s => ({ pantry: [item, ...s.pantry], trash: { ...s.trash, pantry: s.trash.pantry.filter(i => i.id !== item.id) } }));
      await guard(() => repo.putPantry(item));
      return { item, existed: false };
    },
    async addUnidentifiedToFridge(barcode, name) {
      const now = Date.now();
      const item: PantryItem = { id: newId('pan'), name: name?.trim() || `Unknown product ${barcode}`, barcode, boughtAt: todayStr(), createdAt: now, updatedAt: now };
      set(s => ({ pantry: [item, ...s.pantry] }));
      await guard(() => repo.putPantry(item));
      return item;
    },
    async savePantryItem(item) {
      const next = { ...item, updatedAt: Date.now() };
      set(s => ({ pantry: s.pantry.some(i => i.id === next.id) ? s.pantry.map(i => (i.id === next.id ? next : i)) : [next, ...s.pantry] }));
      await guard(() => repo.putPantry(next));
    },
    async removePantryItem(id) {
      const cur = byId(get().pantry, id); if (!cur) return;
      const gone = { ...cur, deletedAt: Date.now(), updatedAt: Date.now() };
      set(s => ({ pantry: s.pantry.filter(i => i.id !== id), trash: { ...s.trash, pantry: [gone, ...s.trash.pantry] } }));
      await guard(() => repo.putPantry(gone));
    },
    async restorePantryItem(id) {
      const cur = byId(get().trash.pantry, id); if (!cur) return;
      const { deletedAt: _d, amountG: _a, ...rest } = cur; void _d; void _a;
      const back: PantryItem = { ...rest, updatedAt: Date.now() };
      set(s => ({ pantry: [back, ...s.pantry], trash: { ...s.trash, pantry: s.trash.pantry.filter(i => i.id !== id) } }));
      await guard(() => repo.putPantry(back));
    },

    // ---------------------------------------------------------------- prices
    async savePrice(foodId, packPrice, packG) {
      const next: FoodPrice = { id: foodId, foodId, packPrice, packG, updatedAt: Date.now() };
      set(s => ({ prices: { ...s.prices, [foodId]: next }, trash: { ...s.trash, prices: s.trash.prices.filter(p => p.id !== foodId) } }));
      await guard(() => repo.putPrice(next));
    },
    async deletePrice(foodId) {
      const cur = get().prices[foodId]; if (!cur) return;
      const gone = { ...cur, deletedAt: Date.now(), updatedAt: Date.now() };
      set(s => { const { [foodId]: _x, ...rest } = s.prices; void _x; return { prices: rest, trash: { ...s.trash, prices: [gone, ...s.trash.prices] } }; });
      await guard(() => repo.putPrice(gone));
    },

    // ---------------------------------------------------------------- weekly plan
    async addToPlan(week, spec) {
      const line = upsertPlanLine(get().plan, week, spec, Date.now(), () => newId('plan'));
      set(s => ({ plan: s.plan.some(l => l.id === line.id) ? s.plan.map(l => (l.id === line.id ? line : l)) : [...s.plan, line] }));
      await guard(() => repo.putPlanLine(line));
      return line;
    },
    async savePlanLine(line) {
      const next = { ...line, updatedAt: Date.now() };
      set(s => ({ plan: s.plan.map(l => (l.id === next.id ? next : l)) }));
      await guard(() => repo.putPlanLine(next));
    },
    async removePlanLine(id) {
      const cur = byId(get().plan, id); if (!cur) return;
      const gone = { ...cur, deletedAt: Date.now(), updatedAt: Date.now() };
      set(s => ({ plan: s.plan.filter(l => l.id !== id), trash: { ...s.trash, plan: [gone, ...s.trash.plan] } }));
      await guard(() => repo.putPlanLine(gone));
    },
    async restorePlanLine(id) {
      const cur = byId(get().trash.plan, id); if (!cur) return;
      const { deletedAt: _d, ...rest } = cur; void _d;
      const back: PlanLine = { ...rest, updatedAt: Date.now() };
      set(s => ({ plan: [...s.plan, back], trash: { ...s.trash, plan: s.trash.plan.filter(l => l.id !== id) } }));
      await guard(() => repo.putPlanLine(back));
    },
    async copyPlanWeek(from, to) {
      const now = Date.now();
      const copies = linesToCopy(get().plan, from, to).map((l, i): PlanLine => ({ ...l, id: newId('plan'), week: to, createdAt: now + i, updatedAt: now + i }));
      if (copies.length === 0) return 0;
      set(s => ({ plan: [...s.plan, ...copies] }));
      await guard(async () => { for (const c of copies) await repo.putPlanLine(c); });
      return copies.length;
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
        settings: s.settings, targets: s.targets, pantry: s.pantry, prices: Object.values(s.prices), plan: s.plan,
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
      const next: AllData = { ...normalizeAllData(snap.data), targets: { ...snap.data.targets, updatedAt: now }, settings: { ...snap.data.settings, favoritesUpdatedAt: now } };
      await repo.replaceAll(next);
      get().applyData(next);
      await syncHooks.markAuthoritative();
      syncHooks.onChange();
    },
  };
});

export { newId };
