import { describe, expect, it } from 'vitest';
import type { FoodPrice, PlanLine } from '../../types';
import { Device, FakeRemote, tick } from './testing';

const setup = () => { const remote = new FakeRemote(); return { remote, a: new Device(remote, 'A'), b: new Device(remote, 'B') }; };
const price = (foodId: string, packPrice: number, packG = 500): FoodPrice => ({ id: foodId, foodId, packPrice, packG, updatedAt: tick() });
const planLine = (id: string, extra: Partial<PlanLine> = {}): PlanLine => ({ id, week: '2026-11-16', name: id, recipeId: 'r', batches: 1, createdAt: tick(), updatedAt: tick(), ...extra });
const livePantry = (d: Device) => d.data.pantry.filter(p => !p.deletedAt).map(p => p.id).sort();

describe('fridge, prices and plan sync like everything else', () => {
  it('a fridge item added on one device appears on the other', async () => {
    const { a, b } = setup();
    a.pantryItem('skyr', 'Skyr', 'food-skyr');
    await a.sync(); await b.sync();
    expect(livePantry(b)).toEqual(['skyr']);
    expect(b.data.pantry[0]).toMatchObject({ name: 'Skyr', foodId: 'food-skyr' });
  });

  it('"ran out" on one device removes it on the other; putting it back later wins over the older removal', async () => {
    const { a, b } = setup();
    a.pantryItem('chicken'); await a.sync(); await b.sync();
    const it = b.data.pantry[0]; it.deletedAt = tick(); it.updatedAt = it.deletedAt;
    await b.sync(); await a.sync();
    expect(livePantry(a)).toEqual([]);
    expect(a.data.pantry[0].deletedAt).toBeDefined(); // kept as a tombstone, so it can still be restored
    const back = a.data.pantry[0]; delete back.deletedAt; back.updatedAt = tick();
    await a.sync(); await b.sync();
    expect(livePantry(b)).toEqual(['chicken']);
  });

  it('two devices editing the same price: the newest edit wins everywhere; deleting beats an older edit', async () => {
    const { a, b } = setup();
    a.data.prices.push(price('chicken', 4)); await a.sync(); await b.sync();
    b.data.prices[0] = { ...b.data.prices[0], packPrice: 5, updatedAt: tick() };
    a.data.prices[0] = { ...a.data.prices[0], packPrice: 6, updatedAt: tick() }; // newer
    await a.sync(); await b.sync(); await a.sync();
    expect(a.data.prices[0].packPrice).toBe(6); expect(b.data.prices[0].packPrice).toBe(6);
    const t = tick();
    b.data.prices[0] = { ...b.data.prices[0], deletedAt: t, updatedAt: t };
    await b.sync(); await a.sync();
    expect(a.data.prices[0].deletedAt).toBe(t);
  });

  it('plan lines from both devices are merged (union), per line', async () => {
    const { a, b } = setup();
    a.data.plan.push(planLine('p1')); b.data.plan.push(planLine('p2', { recipeId: 'other' }));
    await a.sync(); await b.sync(); await a.sync();
    expect(a.data.plan.map(p => p.id).sort()).toEqual(['p1', 'p2']);
    expect(b.data.plan.map(p => p.id).sort()).toEqual(['p1', 'p2']);
  });

  it('uses one small file per kind and never creates empty ones', async () => {
    const { remote, a } = setup();
    a.log('l1', '2026-11-20');
    await a.sync();
    expect([...remote.files.keys()].sort()).toEqual(['logs/2026-11.json', 'settings.json']);
    a.pantryItem('x'); a.data.prices.push(price('f', 1)); a.data.plan.push(planLine('p'));
    await a.sync();
    expect([...remote.files.keys()].sort()).toEqual(['logs/2026-11.json', 'pantry.json', 'plan.json', 'prices.json', 'settings.json']);
    expect(remote.text('pantry.json')).toContain('"id":"x"');
  });

  it('a device on an older version (no new files) and a new one still converge on the old data', async () => {
    const { remote, a, b } = setup();
    a.log('l1', '2026-11-20'); a.food('f1');
    await a.sync();
    expect([...remote.files.keys()]).not.toContain('pantry.json');
    await b.sync();
    expect(b.live()).toEqual(['l1']);
    expect(b.data.pantry).toEqual([]);
  });

  it('authoritative mode (after an import) tombstones fridge items that only exist in the cloud', async () => {
    const { a, b } = setup();
    a.pantryItem('old'); await a.sync();
    b.pantryItem('new'); b.config = { ...b.config, authoritative: true };
    await b.sync(); await a.sync();
    expect(livePantry(b)).toEqual(['new']);
    expect(livePantry(a)).toEqual(['new']);
  });

  it('expired tombstones are dropped during sync (60-day retention)', async () => {
    const { a } = setup();
    const x = a.pantryItem('gone'); x.deletedAt = 1; x.updatedAt = 1;
    await a.sync(100 * 86_400_000);
    expect(a.data.pantry).toEqual([]);
  });
});
