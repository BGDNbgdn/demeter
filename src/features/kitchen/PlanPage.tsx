import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { Card, EmptyState, ProgressBar, SectionTitle } from '../../components/ui/misc';
import { NumInput } from '../../components/ui/NumInput';
import { Sheet } from '../../components/ui/Sheet';
import { useAppStore } from '../../hooks/useAppStore';
import { currencyOf, fmtMoney } from '../../lib/cost';
import { fmtKcal, fmtNum } from '../../lib/engine';
import { describePlan, type PlanLookups } from '../../lib/kitchen';
import { addDays } from '../../utils/dates';
import { IngredientPicker } from '../recipes/IngredientPicker';
import { KitchenShell } from './KitchenShell';
import { WeekNav } from './WeekNav';
import { useWeek } from './useWeek';

const BATCH_STEP = 0.5;

/** Week plan: which recipes to cook (× batches) and which extra foods to buy. Feeds the shopping list. */
export function PlanPage() {
  const week = useWeek(s => s.week);
  const plan = useAppStore(s => s.plan);
  const recipes = useAppStore(s => s.recipes);
  const foodMap = useAppStore(s => s.foodMap);
  const prices = useAppStore(s => s.prices);
  const targets = useAppStore(s => s.targets);
  const currency = useAppStore(s => currencyOf(s.settings));
  const { addToPlan, savePlanLine, removePlanLine, restorePlanLine, copyPlanWeek, showToast } = useAppStore.getState();
  const navigate = useNavigate();
  const [recipeSheet, setRecipeSheet] = useState(false);
  const [foodSheet, setFoodSheet] = useState(false);

  const lines = useMemo(() => plan.filter(l => l.week === week).sort((a, b) => a.createdAt - b.createdAt), [plan, week]);
  const look: PlanLookups = useMemo(() => {
    const rm = new Map(recipes.map(r => [r.id, r]));
    return { recipeOf: id => rm.get(id), foodOf: id => foodMap.get(id), priceOf: id => prices[id] };
  }, [recipes, foodMap, prices]);
  const d = useMemo(() => describePlan(lines, look), [lines, look]);
  const lastWeekCount = useMemo(() => plan.filter(l => l.week === addDays(week, -7)).length, [plan, week]);

  const perDayProtein = d.totals.protein / 7;
  const perDayKcal = d.totals.calories / 7;

  const remove = async (id: string, name: string) => {
    await removePlanLine(id);
    showToast(`${name} removed from the plan`, { actionLabel: 'Undo', onAction: () => { void restorePlanLine(id); } });
  };

  return (
    <KitchenShell title="Kitchen" subtitle="Week plan">
      <div className="space-y-3 pt-3">
        <WeekNav />

        {lines.length > 0 && (
          <Card className="!p-4" data-testid="plan-summary">
            <div className="flex items-baseline justify-between">
              <div className="text-[13px] uppercase tracking-wider font-semibold text-muted">The plan gives you</div>
              {d.cost > 0 && <div className="text-[13px] text-muted tabular">≈ {fmtMoney(d.cost, currency)}{d.costComplete ? '' : '+'} of ingredients</div>}
            </div>
            <div className="flex items-baseline gap-5 mt-1.5 tabular">
              <span><b className="text-[28px] text-protein">{fmtNum(perDayProtein, 0)}</b><span className="text-[13px] text-muted"> g protein / day</span></span>
              <span><b className="text-[20px] text-kcal">{fmtKcal(perDayKcal)}</b><span className="text-[13px] text-muted"> kcal / day</span></span>
            </div>
            <ProgressBar value={perDayProtein} target={targets.protein} color="var(--protein)" height={7} className="mt-2.5" />
            <div className="text-[12px] text-muted mt-1.5">
              {perDayProtein >= targets.protein
                ? `Covers your ${fmtNum(targets.protein, 0)} g protein goal.`
                : `${fmtNum(targets.protein - perDayProtein, 0)} g/day short of your ${fmtNum(targets.protein, 0)} g goal — add another batch or a protein food.`}
              {' '}Averaged over 7 days, assuming you eat it all.
            </div>
          </Card>
        )}

        {lines.length === 0 ? (
          <EmptyState
            icon="recipes" title="Nothing planned yet"
            body="Pick the recipes you’ll cook this week (and any extra foods). Demeter adds up the raw ingredients and checks them against your fridge."
            action={lastWeekCount > 0 ? <Button icon="copy" onClick={async () => { const n = await copyPlanWeek(addDays(week, -7), week); showToast(`Copied ${n} line${n === 1 ? '' : 's'} from last week`, { tone: 'success' }); }}>Copy last week’s plan</Button> : undefined}
          />
        ) : (
          <div className="space-y-2.5">
            {d.rows.map(r => {
              const l = r.line;
              return (
                <Card key={l.id} className="!p-3.5">
                  <div className="flex items-start gap-3">
                    <span className="h-10 w-10 rounded-xl bg-accentsoft text-accent flex items-center justify-center shrink-0"><Icon name={r.kind === 'recipe' ? 'recipes' : 'foods'} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[17px] font-semibold leading-snug line-clamp-2">{r.name}</div>
                      {r.missing ? (
                        <div className="text-[13px] text-warn">{r.kind === 'recipe' ? 'This recipe was deleted' : 'This food was deleted'} — remove it.</div>
                      ) : (
                        <div className="text-[13px] text-muted tabular">
                          <b className="text-protein">{fmtNum(r.macros?.protein ?? 0, 0)} g</b> protein · {fmtKcal(r.macros?.calories ?? 0)} kcal{r.cost != null ? ` · ≈ ${fmtMoney(r.cost, currency)}${r.costComplete ? '' : '+'}` : ''}
                        </div>
                      )}
                    </div>
                    <IconButton icon="x" label={`Remove ${r.name}`} size={36} className="text-muted -mt-1 -mr-1.5" onClick={() => void remove(l.id, r.name)} />
                  </div>
                  {!r.missing && (
                    <div className="mt-2.5 flex items-center justify-end gap-2">
                      {l.recipeId ? (
                        <>
                          <IconButton icon="minus" label="Fewer batches" size={40} className="bg-surface2" disabled={(l.batches ?? 1) <= BATCH_STEP}
                            onClick={() => void savePlanLine({ ...l, batches: Math.max(BATCH_STEP, (l.batches ?? 1) - BATCH_STEP) })} />
                          <div className="w-24 text-center tabular"><b className="text-[20px]">×{fmtNum(l.batches ?? 1, 1)}</b><div className="text-[11px] text-muted -mt-0.5">batch{(l.batches ?? 1) === 1 ? '' : 'es'}</div></div>
                          <IconButton icon="plus" label="More batches" size={40} className="bg-surface2"
                            onClick={() => void savePlanLine({ ...l, batches: (l.batches ?? 1) + BATCH_STEP })} />
                        </>
                      ) : (
                        <NumInput className="w-36" value={l.grams ?? null} onChange={v => v != null && v > 0 && void savePlanLine({ ...l, grams: v })} suffix="g" decimals={0} aria-label={`Grams of ${r.name}`} />
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          <Button icon="recipes" onClick={() => setRecipeSheet(true)}>Add recipe</Button>
          <Button icon="foods" onClick={() => setFoodSheet(true)}>Add food</Button>
        </div>
        {lines.length > 0 && <Button variant="primary" size="lg" block icon="cart" onClick={() => navigate('/shop')}>Make the shopping list</Button>}
        {lines.length > 0 && lastWeekCount > 0 && (
          <button type="button" className="w-full text-center text-[14px] text-accent font-medium h-10" onClick={async () => { const n = await copyPlanWeek(addDays(week, -7), week); showToast(n ? `Copied ${n} line${n === 1 ? '' : 's'} from last week` : 'Nothing new to copy'); }}>
            Copy missing lines from last week
          </button>
        )}
      </div>

      <RecipeSheet open={recipeSheet} onClose={() => setRecipeSheet(false)} week={week} lines={lines.map(l => ({ id: l.recipeId, batches: l.batches ?? 1 }))}
        onAdd={async (id, name) => { await addToPlan(week, { recipeId: id, name }); showToast(`${name} added`, { tone: 'success' }); }} />
      <IngredientPicker open={foodSheet} onClose={() => setFoodSheet(false)} title="Add a food to the plan" hint={false} allowCustom={false}
        onPick={async f => { setFoodSheet(false); await addToPlan(week, { foodId: f.id, name: f.name, grams: 500 }); showToast(`${f.name} added — adjust the grams`, { tone: 'success' }); }} />
    </KitchenShell>
  );
}

function RecipeSheet({ open, onClose, lines, onAdd }: {
  open: boolean; onClose: () => void; week: string; lines: Array<{ id?: string; batches: number }>; onAdd: (id: string, name: string) => Promise<void>;
}) {
  const recipes = useAppStore(s => s.recipes);
  const navigate = useNavigate();
  const inPlan = (id: string) => lines.find(l => l.id === id)?.batches ?? 0;
  return (
    <Sheet open={open} onClose={onClose} title="Add a recipe" zIndex={70}>
      {recipes.length === 0 ? (
        <EmptyState icon="recipes" title="No recipes yet" body="Build a recipe once, then plan it every week."
          action={<Button variant="primary" onClick={() => { onClose(); navigate('/recipes/new'); }}>Create a recipe</Button>} />
      ) : (
        <div className="pb-2">
          <SectionTitle>Tap to add a batch</SectionTitle>
          {recipes.map(r => {
            const n = inPlan(r.id);
            return (
              <button key={r.id} type="button" onClick={() => void onAdd(r.id, r.name)} className="w-full flex items-center gap-3 py-3 text-left border-b border-line/60 active:opacity-60">
                <span className="h-10 w-10 rounded-xl bg-accentsoft text-accent flex items-center justify-center shrink-0"><Icon name="recipes" /></span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium truncate">{r.name}</span>
                  <span className="block text-[13px] text-muted tabular">{fmtNum(r.totals.protein, 0)} g protein per batch · {r.ingredients.length} ingredients</span>
                </span>
                {n > 0 && <span className="text-[12px] font-semibold text-accent px-2 py-1 rounded-lg bg-accentsoft tabular">×{fmtNum(n, 1)} planned</span>}
                <Icon name="plus" size={20} className="text-accent" />
              </button>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
