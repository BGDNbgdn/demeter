import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, Segmented } from '../../components/ui/misc';

const VIEWS = [
  { value: '/fridge', label: 'Fridge' },
  { value: '/plan', label: 'Plan' },
  { value: '/shop', label: 'Shop' },
  { value: '/value', label: 'Value' },
];

/** Shared frame of the four Kitchen views: My fridge · Week plan · Shopping list · Protein value. */
export function KitchenShell({ title, subtitle, right, children }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const current = VIEWS.find(v => v.value === pathname)?.value ?? '/fridge';
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} right={right} />
      <main className="px-4 pb-8 max-w-xl mx-auto">
        <div className="pt-3 pb-1">
          <Segmented value={current} onChange={v => navigate(v)} options={VIEWS} />
        </div>
        {children}
      </main>
    </>
  );
}
