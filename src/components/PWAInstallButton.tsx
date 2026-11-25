import React, {useState} from 'react';
import {CheckCircle2, Download, Share, Smartphone, X} from 'lucide-react';
import {usePWAInstall} from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'card' | 'compact';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({variant = 'card'}) => {
  const {isInstallable, isInstalled, isIOS, install} = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    if (variant === 'compact') return null;
    return (
      <div className="flex items-center gap-3 rounded-2xl bg-emerald-500/10 px-4 py-3.5 text-sm text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        <span>FHEM Control Desk läuft bereits als installierte App im Vollbildmodus.</span>
      </div>
    );
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl theme-btn-primary px-4 py-2.5 text-sm font-semibold transition-colors active:scale-[0.98] whitespace-nowrap shrink-0"
      >
        <Download className="h-4 w-4" />
        Auf Android / Gerät installieren
      </button>
    );
  }

  if (variant === 'compact') {
    if (!isIOS) return null;
    return (
      <>
        <button
          type="button"
          onClick={() => setShowGuide(true)}
          className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-[#2A3444] dark:text-slate-200 dark:hover:bg-[#1B222D] whitespace-nowrap shrink-0"
        >
          <Smartphone className="h-4 w-4" />
          App installieren
        </button>
        {showGuide && <InstallGuideModal isIOS={isIOS} onClose={() => setShowGuide(false)} />}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        className="flex min-h-[44px] w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-[#2A3444] dark:bg-[#1B222D] dark:text-slate-100 dark:hover:bg-[#232C3A] whitespace-nowrap"
      >
        <Smartphone className="h-4 w-4" />
        {isIOS ? 'Auf iPhone / iPad installieren' : 'Als Android-App zum Startbildschirm'}
      </button>
      {showGuide && <InstallGuideModal isIOS={isIOS} onClose={() => setShowGuide(false)} />}
    </>
  );
};

const InstallGuideModal: React.FC<{isIOS: boolean; onClose: () => void}> = ({isIOS, onClose}) => (
  <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-4">
    <div className="w-full max-w-md rounded-3xl theme-surface p-6 shadow-2xl border">
      <div className="flex items-center justify-between gap-4">
        <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
          {isIOS ? 'Auf iPhone / iPad installieren' : 'Auf Android installieren'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Schließen"
          className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#232C3A]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      {isIOS ? (
        <ol className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
          <li>
            Tippe in Safari auf das <strong className="text-slate-900 dark:text-slate-100 inline-flex items-center gap-1"><Share className="h-3.5 w-3.5" /> Teilen</strong>-Symbol.
          </li>
          <li>Wähle im Menü den Eintrag <strong className="text-slate-900 dark:text-slate-100">Zum Home-Bildschirm</strong>.</li>
          <li>Bestätige oben rechts mit <strong className="text-slate-900 dark:text-slate-100">Hinzufügen</strong>.</li>
        </ol>
      ) : (
        <ol className="mt-4 space-y-2.5 text-sm text-slate-600 dark:text-slate-300 list-decimal list-inside">
          <li>Öffne das Browser-Menü (⋮) in Chrome auf deinem Android-Gerät.</li>
          <li>Tippe auf <strong className="text-slate-900 dark:text-slate-100">App installieren</strong> oder <strong className="text-slate-900 dark:text-slate-100">Zum Startbildschirm hinzufügen</strong>.</li>
          <li>FHEM Control Desk startet danach im eigenständigen Vollbildmodus.</li>
        </ol>
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-6 flex min-h-[44px] w-full items-center justify-center rounded-xl theme-btn-primary text-sm font-semibold transition-colors"
      >
        Verstanden
      </button>
    </div>
  </div>
);
