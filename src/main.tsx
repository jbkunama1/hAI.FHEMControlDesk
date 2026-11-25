import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Clean up any stale dev-mode service worker left over from earlier sessions
if (import.meta.env.DEV && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => {
      for (const reg of regs) {
        if (reg.active?.scriptURL.includes('dev-sw.js') || reg.installing?.scriptURL.includes('dev-sw.js')) {
          void reg.unregister();
        }
      }
    })
    .catch(() => {});
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<{children: React.ReactNode}, ErrorBoundaryState> {
  state: ErrorBoundaryState = {hasError: false, message: ''};

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {hasError: true, message: error?.message || 'Unbekannter Laufzeitfehler'};
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6 theme-canvas text-slate-900 dark:text-slate-100">
          <div className="w-full max-w-md rounded-3xl border theme-surface p-6 space-y-4 shadow-xl">
            <h1 className="font-display text-lg font-bold">Ansicht konnte nicht geladen werden</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] w-full rounded-xl theme-btn-primary text-sm font-semibold"
            >
              App neu laden
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
