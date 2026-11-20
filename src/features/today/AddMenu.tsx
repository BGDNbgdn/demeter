import { useNavigate } from 'react-router-dom';
import { Icon, type IconName } from '../../components/ui/Icon';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';

export function AddMenu() {
  const open = useUI(s => s.addMenuOpen);
  const online = useAppStore(s => s.settings.onlineLookupEnabled);
  const navigate = useNavigate();
  const close = () => useUI.setState({ addMenuOpen: false });
  const go = (patch: Parameters<ReturnType<typeof useUI.getState>['open']>[0]) => () => { close(); useUI.getState().open(patch); };

  const item = (icon: IconName, title: string, sub: string, onClick: () => void, tint = 'var(--accent)') => (
    <button key={title} type="button" onClick={onClick} className="w-full flex items-center gap-4 rounded-2xl bg-surface2 px-4 py-3.5 text-left active:bg-surface3">
      <span className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ color: tint, background: 'color-mix(in srgb, currentColor 14%, transparent)' }}><Icon name={icon} /></span>
      <span className="flex-1 min-w-0"><span className="block text-[17px] font-semibold">{title}</span><span className="block text-[13px] text-muted">{sub}</span></span>
      <Icon name="chevR" size={18} className="text-muted" />
    </button>
  );

  return (
    <Sheet open={open} onClose={close} title="Add">
      <div className="space-y-2.5 pt-1 pb-2">
        {item('search', 'Add food', 'Search 900+ foods, favorites & recents', go({ searchOpen: true }))}
        {item('recipes', 'Add recipe portion', 'Log a portion of a cooked dish', go({ recipePickerOpen: true }), 'var(--carbs)')}
        {item('plus', 'Create recipe', 'Ingredients → cooked weight → portions', () => { close(); navigate('/recipes/new'); }, 'var(--calories)')}
        {item('flame', 'Quick add calories & macros', 'When you only know the totals', go({ quickAddOpen: true }), 'var(--fat)')}
        {item('foods', 'Create custom food', 'Your own product or ingredient', go({ foodForm: { logAfter: true } }), 'var(--fiber)')}
        {online && item('scan', 'Scan or look up a packaged product', 'Optional · needs internet (Open Food Facts)', go({ offOpen: true }), 'var(--muted)')}
      </div>
    </Sheet>
  );
}
