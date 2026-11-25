import { describe, expect, it } from 'vitest';
import type { PantryItem } from '../types';
import { ageInDays, boughtDate, boughtLabel, byOldest } from './kitchen';
import { swipeTarget } from '../components/SwipeNav';

const item = (over: Partial<PantryItem>): PantryItem => ({ id: 'a', name: 'Skyr', createdAt: new Date(2026, 10, 10, 12).getTime(), updatedAt: 1, ...over });

describe('when was it bought', () => {
  it('uses the saved day, falling back to the day the item was added', () => {
    expect(boughtDate(item({ boughtAt: '2026-11-20' }))).toBe('2026-11-20');
    expect(boughtDate(item({}))).toBe('2026-11-10');
  });
  it('counts whole days and never goes negative', () => {
    expect(ageInDays(item({ boughtAt: '2026-11-25' }), '2026-11-25')).toBe(0);
    expect(ageInDays(item({ boughtAt: '2026-11-20' }), '2026-11-25')).toBe(5);
    expect(ageInDays(item({ boughtAt: '2026-12-01' }), '2026-11-25')).toBe(0);
  });
  it('writes a friendly label', () => {
    const t = '2026-11-25';
    expect(boughtLabel(item({ boughtAt: '2026-11-25' }), t)).toBe('Bought today');
    expect(boughtLabel(item({ boughtAt: '2026-11-24' }), t)).toBe('Bought yesterday');
    expect(boughtLabel(item({ boughtAt: '2026-11-18' }), t)).toBe('Bought 7 days ago');
    expect(boughtLabel(item({ boughtAt: '2026-09-01' }), t)).toBe('Bought 1 Sep');
  });
  it('oldest first, then by name', () => {
    const list = [item({ id: '1', name: 'B', boughtAt: '2026-11-20' }), item({ id: '2', name: 'A', boughtAt: '2026-11-20' }), item({ id: '3', name: 'Z', boughtAt: '2026-11-01' })];
    expect(list.sort(byOldest).map(i => i.id)).toEqual(['3', '2', '1']);
  });
});

describe('swipe between pages', () => {
  it('left goes to the next tab, right to the previous', () => {
    expect(swipeTarget('/', -120, 5, 200)).toBe('/foods');
    expect(swipeTarget('/foods', 120, 5, 200)).toBe('/');
    expect(swipeTarget('/recipes', -120, 5, 200)).toBe('/fridge'); // Kitchen's views follow Recipes
    expect(swipeTarget('/fridge', -120, 5, 200)).toBe('/plan');
    expect(swipeTarget('/value', -120, 5, 200)).toBe('/history');
  });
  it('does nothing at the ends, on other pages, or for slow / short / diagonal drags', () => {
    expect(swipeTarget('/', 120, 0, 200)).toBeNull();
    expect(swipeTarget('/settings', -120, 0, 200)).toBeNull();
    expect(swipeTarget('/recipes/abc', -120, 0, 200)).toBeNull();
    expect(swipeTarget('/foods', -40, 0, 200)).toBeNull(); // too short
    expect(swipeTarget('/foods', -120, 90, 200)).toBeNull(); // mostly vertical (scrolling)
    expect(swipeTarget('/foods', -120, 0, 900)).toBeNull(); // slow
  });
});
