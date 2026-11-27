import React from 'react';
import {AlertTriangle, Palette, RefreshCw, Search, Sparkles, User, Wifi, WifiOff} from 'lucide-react';
import type {ConnectionStatus, UserAccount} from '../types/fhem';
import {useOnlineStatus} from '../hooks/usePWAInstall';

interface AppHeaderProps {
  status: ConnectionStatus;
  refreshing: boolean;
  currentUser: UserAccount | null;
  onRefresh: () => void;
  onOpenSearch: () => void;
  onOpenSaveConfig: () => void;
  onOpenThemePicker: () => void;
  onOpenAssistant: () => void;
  onOpenAccount: () => void;
}

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  status,
  refreshing,
  currentUser,
  onRefresh,
  onOpenSearch,
  onOpenSaveConfig,
  onOpenThemePicker,
  onOpenAssistant,
  onOpenAccount,
}) => {
  const browserOnline = useOnlineStatus();
  const effectiveOnline = browserOnline && status.online;

  return (
    <header className="sticky top-0 z-30 h-14 border-b theme-border bg-[var(--m3-surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-4 px-6">
        {/* Left: Live Connection Telemetry */}
        <div
          className="flex min-w-0 items-center gap-2 text-xs font-medium"
          aria-live="polite"
          title={status.errorMessage || (effectiveOnline ? 'FHEMWEB erreichbar' : 'FHEMWEB nicht erreichbar')}
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              effectiveOnline ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            aria-hidden="true"
          />
          {effectiveOnline ? (
            <Wifi className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <WifiOff className="h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <span
            className={`whitespace-nowrap ${
              effectiveOnline
                ? 'text-emerald-700 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {!browserOnline ? 'Gerät offline' : effectiveOnline ? 'Online' : 'Offline'}
          </span>
          {effectiveOnline && status.latencyMs !== null && (
            <>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {status.latencyMs} ms
              </span>
            </>
          )}
          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
          <span className="truncate text-slate-500 dark:text-slate-400">
            {status.configMode === 'local_instance' ? 'Test-Instanz (FHEMWEB)' : 'FHEM-Server'}
          </span>
          {effectiveOnline && status.longpollState && status.longpollState !== 'off' && (
            <>
              <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
              <span
                className={`whitespace-nowrap ${
                  status.longpollState === 'connected'
                    ? 'theme-text font-semibold'
                    : status.longpollState === 'error'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {status.longpollState === 'connected'
                  ? 'Longpoll'
                  : status.longpollState === 'reconnecting' || status.longpollState === 'connecting'
                    ? 'Longpoll…'
                    : 'Polling'}
              </span>
            </>
          )}
        </div>

        {/* Right: Unsaved indicator (when dirty), Global Search, Assistant, Theme Picker, Profile, Refresh */}
        <div className="flex items-center gap-1 shrink-0">
          {status.unsavedChanges && (
            <button
              type="button"
              onClick={onOpenSaveConfig}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300 whitespace-nowrap"
              title="Ungespeicherte Konfigurationsänderungen in fhem.cfg speichern"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>Save ausstehend</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Globale Suche öffnen"
            className="flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-3.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Geräte & Readings suchen
            </span>
            <kbd className="rounded-md border theme-border px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              /
            </kbd>
          </button>

          <button
            type="button"
            onClick={onOpenAssistant}
            aria-label="FHEM KI-Assistent öffnen"
            title="FHEM KI-Assistent"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Sparkles className="h-4.5 w-4.5 theme-text" />
          </button>

          <button
            type="button"
            onClick={onOpenThemePicker}
            aria-label="Design und Farbthemes öffnen"
            title="Design & Farbthemes"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Palette className="h-4.5 w-4.5 theme-text" />
          </button>

          <button
            type="button"
            onClick={onOpenAccount}
            aria-label={currentUser ? `Profil ${currentUser.displayName} öffnen` : 'Anmelden oder Profil erstellen'}
            title={currentUser ? `Profil: ${currentUser.displayName}` : 'Anmelden / Profil erstellen'}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            {currentUser ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg theme-tonal font-display text-[11px] font-bold">
                {userInitials(currentUser.displayName)}
              </span>
            ) : (
              <User className="h-4.5 w-4.5" />
            )}
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Gerätestatus aktualisieren"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${refreshing ? 'animate-spin theme-text' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
