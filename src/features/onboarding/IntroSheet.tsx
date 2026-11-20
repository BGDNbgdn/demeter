import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { useUI } from '../../hooks/useUI';

export function IntroSheet() {
  const introSeen = useAppStore(s => s.settings.introSeen);
  const ready = useAppStore(s => s.ready);
  const manual = useUI(s => s.introOpen);
  const update = useAppStore(s => s.updateSettings);
  const open = (ready && !introSeen) || manual;
  const done = () => { useUI.setState({ introOpen: false }); if (!introSeen) void update({ introSeen: true }); };
  return (
    <Sheet open={open} onClose={done} title="Welcome to Demeter" zIndex={95}
      footer={<Button variant="primary" size="lg" block onClick={done}>Got it — let’s track</Button>}>
      <div className="space-y-4 pt-1 text-[16px] leading-snug">
        <p>Cooked food weighs less than raw food, because water leaves. The nutrients stay — so <b>100 g of cooked chicken has more protein than 100 g of raw</b>. Most apps get this wrong. Demeter doesn’t.</p>
        <div className="rounded-3xl bg-surface2 p-4 space-y-3">
          <div className="flex items-center justify-between text-[15px]"><span className="text-muted">Raw chicken</span><b className="tabular">1,000 g · 20 g protein/100 g</b></div>
          <div className="flex items-center justify-between text-[15px]"><span className="text-muted">After cooking</span><b className="tabular">800 g</b></div>
          <div className="h-px bg-line" />
          <div className="flex items-center justify-between text-[15px]"><span className="text-muted">Protein per 100 g cooked</span><b className="tabular text-protein">25 g</b></div>
          <div className="flex items-center justify-between text-[15px]"><span className="text-muted">You eat 300 g</span><b className="tabular text-protein">75 g protein · 412.5 kcal</b></div>
        </div>
        <ul className="space-y-2 text-[15px] text-muted">
          <li><b className="text-ink">Log a food</b> — pick “Cooked (convert)” and enter the batch’s raw and cooked weight.</li>
          <li><b className="text-ink">Build a recipe</b> — add raw ingredients, weigh the finished dish, then log any portion.</li>
          <li><b className="text-ink">Works offline.</b> Everything is stored on this iPhone only — no account, no cloud.</li>
          <li><b className="text-ink">Back up in Settings</b> — export a JSON file to the Files app now and then.</li>
        </ul>
      </div>
    </Sheet>
  );
}
