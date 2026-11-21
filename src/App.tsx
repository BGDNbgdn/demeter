import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { BottomNav } from './components/BottomNav';
import { Overlays } from './components/Overlays';
import { Notice } from './components/ui/misc';
import { FoodsPage } from './features/foods/FoodsPage';
import { RecipeEditorPage } from './features/recipes/RecipeEditorPage';
import { RecipesPage } from './features/recipes/RecipesPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { TodayPage } from './features/today/TodayPage';
import { FridgePage } from './features/kitchen/FridgePage';
import { PlanPage } from './features/kitchen/PlanPage';
import { ShopPage } from './features/kitchen/ShopPage';
import { ValuePage } from './features/kitchen/ValuePage';
import { useAppStore } from './hooks/useAppStore';
import { useTheme } from './hooks/useTheme';
import { UpdateBanner } from './components/UpdateBanner';
import { ErrorBoundary } from './components/ErrorBoundary';
import { initSync } from './lib/sync/orchestrator';

const HistoryPage = lazy(() => import('./features/history/HistoryPage'));
const ReviewPage = lazy(() => import('./features/history/ReviewPage'));

function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  const init = useAppStore(s => s.init);
  const ready = useAppStore(s => s.ready);
  const loadError = useAppStore(s => s.loadError);
  useTheme();
  useEffect(() => { void init().then(() => initSync()); }, [init]);

  if (!ready) {
    return <div className="h-full flex items-center justify-center text-muted" role="status">Loading…</div>;
  }
  return (
    <ErrorBoundary>
    <HashRouter>
      <ScrollReset />
      <div className="min-h-full pb-[calc(86px+env(safe-area-inset-bottom))]">
        {loadError && <div className="p-4 pt-safe"><Notice tone="error">{loadError}</Notice></div>}
        <UpdateBanner />
        <Suspense fallback={<div className="p-10 text-center text-muted">Loading…</div>}>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/foods" element={<FoodsPage />} />
            <Route path="/recipes" element={<RecipesPage />} />
            <Route path="/recipes/:id" element={<RecipeEditorPage />} />
            <Route path="/fridge" element={<FridgePage />} />
            <Route path="/plan" element={<PlanPage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/value" element={<ValuePage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<TodayPage />} />
          </Routes>
        </Suspense>
      </div>
      <BottomNav />
      <Overlays />
    </HashRouter>
    </ErrorBoundary>
  );
}
