import React from 'react';
import {AlertTriangle, CalendarClock, LineChart, Palette, RefreshCw, Search, Sparkles, Wifi, WifiOff} from 'lucide-react';
import type {ConnectionStatus} from '../types/fhem';
import {useOnlineStatus} from '../hooks/usePWAInstall';

interface AppHeaderProps {
  status: ConnectionStatus;
  refreshing: boolean;
  onRefresh: () => void;
  onOpenSearch: () => void;
  onOpenSaveConfig: () => void;
  onOpenThemePicker: () => void;
  onOpenAssistant: () => void;
  onOpenCalendar: () => void;
  onOpenCharts: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  status,
  refreshing,
  onRefresh,
  onOpenSearch,
  onOpenSaveConfig,
  onOpenThemePicker,
  onOpenAssistant,
  onOpenCalendar,
  onOpenCharts,
}) => {
  const browserOnline = useOnlineStatus();
  const effectiveOnline = browserOnline && status.online;

  return (
    <header className="sticky top-0 z-30 h-14 border-b theme-border bg-[var(--m3-surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-7xl items-center justify-between gap-3 px-4 lg:px-6">
        {/* Left: Brand & Live Connection Telemetry */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2.5 lg:hidden">
            <img
              src="/icon.svg"
              alt="FHEM Control Desk"
              className="h-8 w-8 rounded-xl shrink-0"
              referrerPolicy="no-referrer"
            />
            <span className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap">
              FHEM Control Desk
            </span>
          </div>

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
              <Wifi className="hidden sm:block h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <WifiOff className="hidden sm:block h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
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
            <span className="hidden md:inline text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span className="hidden md:inline truncate text-slate-500 dark:text-slate-400">
              {status.configMode === 'local_instance' ? 'Test-Instanz (FHEMWEB)' : 'FHEM-Server'}
            </span>
            {effectiveOnline && status.longpollState && status.longpollState !== 'off' && (
              <>
                <span className="hidden sm:inline text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
                <span
                  className={`hidden sm:inline whitespace-nowrap ${
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
        </div>

        {/* Right: Unsaved indicator (when dirty), Global Search, Theme Picker, Refresh */}
        <div className="flex items-center gap-1 shrink-0">
          {status.unsavedChanges && (
            <button
              type="button"
              onClick={onOpenSaveConfig}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-500/25 dark:text-amber-300 whitespace-nowrap"
              title="Ungespeicherte Konfigurationsänderungen in fhem.cfg speichern"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Save ausstehend</span>
              <span className="sm:hidden">Save?</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Globale Suche öffnen"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl px-2.5 sm:px-3.5 text-sm text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Search className="h-4.5 w-4.5 shrink-0" />
            <span className="hidden md:inline text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              Geräte & Readings suchen
            </span>
            <kbd className="hidden lg:inline-block rounded-md border theme-border px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              /
            </kbd>
          </button>

          <button
            type="button"
            onClick={onOpenCalendar}
            aria-label="Zeitpläne und Kalender öffnen"
            title="Kalender & Zeitpläne"
            className="flex lg:hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <CalendarClock className="h-4.5 w-4.5" />
          </button>

          <button
            type="button"
            onClick={onOpenCharts}
            aria-label="Sensordiagramme öffnen"
            title="Diagramme & Sensorverlauf"
            className="flex lg:hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <LineChart className="h-4.5 w-4.5" />
          </button>

          <button
            type="button"
            onClick={onOpenAssistant}
            aria-label="FHEM KI-Assistent öffnen"
            title="FHEM KI-Assistent"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Sparkles className="h-4.5 w-4.5 theme-text" />
          </button>

          <button
            type="button"
            onClick={onOpenThemePicker}
            aria-label="Design und Farbthemes öffnen"
            title="Design & Farbthemes"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Palette className="h-4.5 w-4.5 theme-text" />
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Gerätestatus aktualisieren"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <RefreshCw className={`h-4.5 w-4.5 ${refreshing ? 'animate-spin theme-text' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
