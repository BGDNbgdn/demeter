import { create } from 'zustand';
import { todayStr } from '../../utils/dates';
import { weekStart } from '../../lib/kitchen';

/** Which week the Plan and Shop views are showing (shared, so switching between them keeps the week). */
export const useWeek = create<{ week: string; setWeek: (w: string) => void }>(set => ({
  week: weekStart(todayStr()),
  setWeek: week => set({ week }),
}));
