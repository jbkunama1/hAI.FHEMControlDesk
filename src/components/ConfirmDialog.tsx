import React from 'react';
import {AlertTriangle, ShieldAlert, X} from 'lucide-react';

export interface ConfirmDialogRequest {
  title: string;
  description: string;
  fhemCommand: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<void> | void;
}

interface ConfirmDialogProps {
  request: ConfirmDialogRequest | null;
  busy?: boolean;
  onClose: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({request, busy = false, onClose}) => {
  if (!request) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-3xl border theme-surface p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                request.destructive
                  ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                  : 'theme-tonal'
              }`}
            >
              {request.destructive ? <ShieldAlert className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <h2
                id="confirm-dialog-title"
                className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
              >
                {request.title}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Admin-Aktion erfordert Bestätigung
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Abbrechen"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.08]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {request.description}
        </p>

        <div className="mt-4 rounded-2xl theme-surface-alt px-3.5 py-2.5 border theme-border">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Auszuführender FHEM-Befehl
          </div>
          <code className="mt-1 block break-all font-mono text-xs theme-text">
            {request.fhemCommand}
          </code>
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-[44px] rounded-xl px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.08] whitespace-nowrap"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              await request.onConfirm();
              onClose();
            }}
            className={`min-h-[44px] rounded-xl px-5 py-2 text-sm font-semibold transition-colors disabled:opacity-60 whitespace-nowrap ${
              request.destructive
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'theme-btn-primary'
            }`}
          >
            {busy ? 'Wird ausgeführt...' : request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
