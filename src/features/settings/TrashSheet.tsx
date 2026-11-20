import { Button } from '../../components/ui/Button';
import { EmptyState, SectionTitle } from '../../components/ui/misc';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';
import { fmtNum } from '../../lib/engine';
import { TRASH_RETENTION_DAYS, daysLeftInTrash } from '../../lib/trash';
import { formatShort } from '../../utils/dates';

function ago(ts: number): string {
  const d = Math.floor((Date.now() - ts) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

/** Everything you deleted in the last 60 days, with one-tap restore. */
export function TrashSheet() {
  const open = useUI(s => s.trashOpen);
  const trash = useAppStore(s => s.trash);
  const { restoreLog, restoreFood, restoreRecipe, showToast } = useAppStore.getState();
  const close = () => useUI.setState({ trashOpen: false });
  const total = trash.logs.length + trash.foods.length + trash.recipes.length;

  const row = (key: string, title: string, sub: string, deletedAt: number, onRestore: () => Promise<void>, doneMsg: string) => (
    <div key={key} className="flex items-center gap-3 py-2.5 border-b border-line/60">
      <div className="flex-1 min-w-0">
        <div className="text-[16px] font-medium truncate">{title}</div>
        <div className="text-[12px] text-muted">{sub} · deleted {ago(deletedAt)} · {daysLeftInTrash(deletedAt)} d left</div>
      </div>
      <Button size="sm" variant="secondary" onClick={async () => { await onRestore(); showToast(doneMsg, { tone: 'success' }); }}>Restore</Button>
    </div>
  );

  return (
    <Sheet open={open} onClose={close} tall title="Recently deleted">
      {total === 0 ? (
        <EmptyState icon="trash" title="Nothing deleted" body={`Deleted entries, recipes and custom foods wait here for ${TRASH_RETENTION_DAYS} days so you can bring them back.`} />
      ) : (
        <div className="pb-4">
          <p className="text-[13px] text-muted pt-1">Items are removed for good after {TRASH_RETENTION_DAYS} days.</p>
          {trash.recipes.length > 0 && <><SectionTitle>Recipes</SectionTitle>{trash.recipes.map(r => row(r.id, r.name, `${r.ingredients.length} ingredients`, r.deletedAt as number, () => restoreRecipe(r.id), 'Recipe restored'))}</>}
          {trash.foods.length > 0 && <><SectionTitle>Custom foods</SectionTitle>{trash.foods.map(f => row(f.id, f.name, `${fmtNum(f.proteinPer100g, 1)} g protein /100 g`, f.deletedAt as number, () => restoreFood(f.id), 'Food restored'))}</>}
          {trash.logs.length > 0 && <><SectionTitle>Logged entries</SectionTitle>{[...trash.logs].sort((a, b) => (b.deletedAt ?? 0) - (a.deletedAt ?? 0)).map(l => row(l.id, l.name, `${formatShort(l.date)} · ${fmtNum(l.protein, 1)} g protein`, l.deletedAt as number, () => restoreLog(l.id), 'Entry restored'))}</>}
        </div>
      )}
    </Sheet>
  );
}
