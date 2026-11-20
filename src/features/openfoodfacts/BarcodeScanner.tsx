import { useEffect, useRef, useState } from 'react';
import { Notice } from '../../components/ui/misc';

/**
 * Camera barcode scanner. Uses the native BarcodeDetector where available (Chrome/Android),
 * otherwise falls back to ZXing (loaded on demand, so it never affects normal use).
 */
export function BarcodeScanner({ onDetect }: { onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let raf = 0;

    const done = (code: string) => { if (!stopped) { stopped = true; onDetect(code); } };

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is not available in this browser.');
        const video = videoRef.current!;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Detector = (window as any).BarcodeDetector;
        if (Detector) {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
          video.srcObject = stream;
          await video.play();
          const detector = new Detector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
          const tick = async () => {
            if (stopped) return;
            try {
              const codes = await detector.detect(video);
              if (codes[0]?.rawValue) return done(codes[0].rawValue);
            } catch { /* keep scanning */ }
            raf = requestAnimationFrame(tick);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, result => {
            if (result) done(result.getText());
          });
          stopZxing = () => controls.stop();
        }
      } catch (e) {
        const msg = (e as Error).message || 'Could not start the camera.';
        setError(/denied|permission|notallowed/i.test(msg) ? 'Camera permission was denied. Allow it in Settings → Safari, or type the barcode number instead.' : msg);
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stopZxing?.();
      stream?.getTracks().forEach(t => t.stop());
      const v = videoRef.current;
      if (v?.srcObject) { (v.srcObject as MediaStream).getTracks().forEach(t => t.stop()); v.srcObject = null; }
    };
  }, [onDetect]);

  return (
    <div className="space-y-2">
      <div className="relative aspect-[4/3] rounded-3xl overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-accent/80 shadow-[0_0_12px_var(--accent)]" />
      </div>
      {error ? <Notice tone="warn">{error}</Notice> : <p className="text-[13px] text-muted text-center">Point the camera at the barcode.</p>}
    </div>
  );
}
