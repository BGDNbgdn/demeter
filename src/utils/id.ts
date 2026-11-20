/** Short random id, collision-safe enough for a personal dataset. */
export function newId(prefix = ''): string {
  const rnd = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
    : Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return prefix ? `${prefix}-${rnd}` : rnd;
}
