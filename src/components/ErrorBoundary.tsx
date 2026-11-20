import { Component, type ReactNode } from 'react';

/** Last-resort screen so a bug never leaves a blank page. Data is safe: it lives in IndexedDB, not in this component. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error('Demeter crashed:', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-full flex flex-col items-center justify-center gap-4 p-8 text-center pt-safe">
        <div className="text-[22px] font-bold">Something went wrong</div>
        <p className="text-muted max-w-xs">Your data is safe — it is stored on this device. Reload to continue.</p>
        <pre className="text-[11px] text-muted max-w-full overflow-auto">{this.state.error.message}</pre>
        <button className="h-12 px-6 rounded-2xl bg-accent text-accentink font-semibold" onClick={() => { location.hash = '#/'; location.reload(); }}>Reload</button>
      </div>
    );
  }
}
