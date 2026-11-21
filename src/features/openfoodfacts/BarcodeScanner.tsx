import { useEffect, useRef, useState } from 'react';
import { Notice } from '../../components/ui/misc';

/** Seen the same code again within this window while scanning continuously → ignore it. */
const SAME_CODE_COOLDOWN_MS = 3500;

interface Props {
  /**
   * Called with each detected code. In `continuous` mode the scanner waits for the returned promise,
   * then keeps looking (so you can scan a whole shopping bag without reopening the camera).
   */
  onDetect: (code: string) => void | Promise<void>;
  continuous?: boolean;
  /** Hint under the video. */
  hint?: string;
  /** Shorter video (leaves room for a result list underneath). */
  wide?: boolean;
}

/**
 * Camera barcode scanner. Uses the native BarcodeDetector where available (Chrome/Android),
 * otherwise falls back to ZXing (loaded on demand, so it never affects normal use).
 */
export function BarcodeScanner({ onDetect, continuous = false, hint, wide = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  // the camera must not restart just because the parent re-rendered with a new callback
  const cb = useRef(onDetect);
  cb.current = onDetect;

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let stopZxing: (() => void) | null = null;
    let raf = 0;
    let processing = false;
    let last = { code: '', at: 0 };

    /** returns true when the code should be handled (not a repeat of the one just handled) */
    const accept = (code: string) => {
      const now = Date.now();
      if (continuous && code === last.code && now - last.at < SAME_CODE_COOLDOWN_MS) return false;
      last = { code, at: now };
      return true;
    };
    const handle = async (code: string) => {
      if (processing || stopped || !accept(code)) return;
      processing = true;
      if (!continuous) stopped = true;
      try { await cb.current(code); } finally { processing = false; last.at = Date.now(); }
    };

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
              if (!processing) {
                const codes = await detector.detect(video);
                if (codes[0]?.rawValue) await handle(codes[0].rawValue);
              }
            } catch { /* keep scanning */ }
            if (!stopped) raf = requestAnimationFrame(tick);
          };
          tick();
        } else {
          const { BrowserMultiFormatReader } = await import('@zxing/browser');
          const reader = new BrowserMultiFormatReader();
          const controls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, result => {
            if (result) void handle(result.getText());
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
  }, [continuous]);

  return (
    <div className="space-y-2">
      <div className={`relative ${wide ? 'aspect-[16/10]' : 'aspect-[4/3]'} rounded-3xl overflow-hidden bg-black`}>
        <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
        {!error && <div className="pointer-events-none absolute inset-x-8 top-1/2 h-0.5 -translate-y-1/2 bg-accent/80 shadow-[0_0_12px_var(--accent)]" />}
      </div>
      {error ? <Notice tone="warn">{error}</Notice> : <p className="text-[13px] text-muted text-center">{hint ?? 'Point the camera at the barcode.'}</p>}
    </div>
  );
}
