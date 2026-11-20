// Test helper: an in-memory stand-in for the GitHub repository (same stale-sha rule as the real API).
import { defaultSettings, DEFAULT_TARGETS } from '../../db/defaults';
import type { AllData, Food, MealLogEntry, Recipe, SyncConfig } from '../../types';
import { LocalChangedError, runSync } from './engine';
import { SyncConflict, SyncError, type RemoteStore } from './github';
import { fingerprint, isSyncedPath } from './merge';

export class FakeRemote implements RemoteStore {
  files = new Map<string, { text: string; sha: string }>();
  counter = 0; reads = 0; writes = 0; lists = 0;
  beforeWrite?: (path: string) => void;
  failWith?: Error;
  async listFiles() {
    this.lists++;
    if (this.failWith) throw this.failWith;
    return Object.fromEntries([...this.files].filter(([p]) => isSyncedPath(p)).map(([p, f]) => [p, f.sha]));
  }
  async readFile(path: string) { this.reads++; const f = this.files.get(path); if (!f) throw new SyncError('other', `404 ${path}`); return f.text; }
  async writeFile(path: string, text: string, sha: string | undefined, _message?: string) {
    void _message;
    this.writes++;
    this.beforeWrite?.(path);
    const cur = this.files.get(path);
    if (cur ? cur.sha !== sha : sha !== undefined) throw new SyncConflict(); // same rule as GitHub: stale sha → conflict
    const next = `sha${++this.counter}`;
    this.files.set(path, { text, sha: next });
    return next;
  }
  text(path: string) { return this.files.get(path)?.text; }
}


let clock = 1_000_000;
export const tick = () => ++clock;

export class Device {
  data: AllData = { foods: [], recipes: [], logs: [], usage: [], settings: defaultSettings(), targets: { ...DEFAULT_TARGETS } };
  config: SyncConfig = { token: 't', repo: 'me/data', branch: 'main', connectedAt: 0, files: {} };
  constructor(public remote: FakeRemote, public name = 'dev') {}
  async sync(now = tick()) {
    const out = await runSync({
      remote: this.remote, config: this.config, now: () => now,
      loadLocal: async () => structuredClone(this.data),
      saveLocal: async (merged, base) => { if (fingerprint(this.data) !== fingerprint(base)) throw new LocalChangedError(); this.data = structuredClone(merged); },
    });
    this.config = out.config;
    return out;
  }
  log(id: string, date: string, protein = 30): MealLogEntry {
    const t = tick();
    const l: MealLogEntry = { id, date, mealType: 'lunch', name: id, consumedWeightG: 100, protein, carbs: 0, fat: 0, calories: protein * 4, fiber: 0, createdAt: t, updatedAt: t };
    this.data.logs.push(l);
    return l;
  }
  edit(id: string, patch: Partial<MealLogEntry>) { const l = this.data.logs.find(x => x.id === id)!; Object.assign(l, patch, { updatedAt: tick() }); }
  remove(id: string) { const l = this.data.logs.find(x => x.id === id)!; l.deletedAt = tick(); l.updatedAt = l.deletedAt; }
  restore(id: string) { const l = this.data.logs.find(x => x.id === id)!; delete l.deletedAt; l.updatedAt = tick(); }
  live() { return this.data.logs.filter(l => !l.deletedAt).map(l => l.id).sort(); }
  food(id: string, protein = 20): Food {
    const t = tick();
    const f: Food = { id, name: id, category: 'custom', proteinPer100g: protein, carbsPer100g: 0, fatPer100g: 1, caloriesPer100g: 90, isLiquid: false, nutritionBasis: 'raw', source: 'custom', createdAt: t, updatedAt: t };
    this.data.foods.push(f);
    return f;
  }
  recipe(id: string): Recipe {
    const t = tick();
    const z = { protein: 0, carbs: 0, fat: 0, calories: 0, fiber: 0 };
    const r: Recipe = { id, name: id, ingredients: [], rawTotalWeightG: 0, totals: z, per100Raw: z, portionSizesG: [], createdAt: t, updatedAt: t };
    this.data.recipes.push(r);
    return r;
  }
}

