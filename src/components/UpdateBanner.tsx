import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Button } from './ui/Button';

/** Shows "new version available" when the service worker has an update waiting. */
export function UpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [update, setUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const fn = registerSW({
      onNeedRefresh() { setNeedRefresh(true); },
      onRegisterError(e) { console.warn('Service worker registration failed', e); },
    });
    setUpdate(() => () => fn(true));
    // Check for updates whenever the app returns to the foreground (installed PWAs stay alive for days).
    const onVis = () => { if (document.visibilityState === 'visible') navigator.serviceWorker?.getRegistration().then(r => r?.update()).catch(() => {}); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!needRefresh) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[85] pt-safe">
      <div className="mx-3 mt-2 flex items-center gap-3 rounded-2xl bg-grad px-4 py-2.5">
        <span className="flex-1 text-[14px] font-medium">A new version of Demeter is ready.</span>
        <Button size="sm" variant="secondary" className="!bg-black/15 !text-[#1a1030]" onClick={() => void update?.()}>Update</Button>
      </div>
    </div>
  );
}
