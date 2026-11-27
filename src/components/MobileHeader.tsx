import React from 'react';
import {RefreshCw, Search, User} from 'lucide-react';
import type {ActiveTab, ConnectionStatus, UserAccount} from '../types/fhem';
import {useOnlineStatus} from '../hooks/usePWAInstall';

interface MobileHeaderProps {
  activeTab: ActiveTab;
  selectedRoom: string | null;
  status: ConnectionStatus;
  refreshing: boolean;
  currentUser: UserAccount | null;
  onRefresh: () => void;
  onOpenSearch: () => void;
  onOpenAccount: () => void;
  onOpenMenu: () => void;
}

const TAB_TITLES: Record<ActiveTab, string> = {
  dashboard: 'Dashboard',
  rooms: 'Räume',
  devices: 'Geräte',
  calendar: 'Kalender',
  charts: 'Diagramme',
  assistant: 'KI-Assistent',
  settings: 'Einstellungen',
};

function userInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({
  activeTab,
  selectedRoom,
  status,
  refreshing,
  currentUser,
  onRefresh,
  onOpenSearch,
  onOpenAccount,
  onOpenMenu,
}) => {
  const browserOnline = useOnlineStatus();
  const effectiveOnline = browserOnline && status.online;
  const pageTitle = activeTab === 'rooms' && selectedRoom ? selectedRoom : TAB_TITLES[activeTab];

  return (
    <header className="sticky top-0 z-30 h-[52px] border-b theme-border bg-[var(--m3-surface)]/95 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-2xl items-center justify-between gap-2 px-3">
        {/* Left: Brand Icon + Compact 2-Line Page Title & Live Telemetry Trigger */}
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Status und Menü öffnen"
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-1 pr-2 text-left transition-colors active:bg-slate-100 dark:active:bg-white/[0.06]"
        >
          <img
            src="/icon.svg"
            alt="FHEM Control Desk"
            className="h-8 w-8 rounded-xl shrink-0"
            referrerPolicy="no-referrer"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-sm font-bold leading-tight text-slate-900 dark:text-slate-100">
              {pageTitle}
            </div>
            <div
              className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-none"
              aria-live="polite"
            >
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  effectiveOnline ? 'bg-emerald-500' : 'bg-red-500'
                }`}
                aria-hidden="true"
              />
              <span
                className={`whitespace-nowrap font-medium ${
                  effectiveOnline
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {!browserOnline ? 'Offline' : effectiveOnline ? 'Online' : 'Getrennt'}
              </span>
              {effectiveOnline && status.latencyMs !== null && (
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  · {status.latencyMs} ms
                </span>
              )}
              {status.unsavedChanges && (
                <span className="truncate font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  · Save
                </span>
              )}
            </div>
          </div>
        </button>

        {/* Right: Exactly 3 Touch-Sized (44x44px) Primary Actions — Zero Crowding */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Globale Suche öffnen"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors active:bg-slate-100 dark:text-slate-300 dark:active:bg-white/10"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-label="Gerätestatus aktualisieren"
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors active:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:active:bg-white/10"
          >
            <RefreshCw className={`h-[18px] w-[18px] ${refreshing ? 'animate-spin theme-text' : ''}`} />
          </button>

          <button
            type="button"
            onClick={onOpenAccount}
            aria-label={currentUser ? `Profil ${currentUser.displayName}` : 'Profil öffnen'}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-600 transition-colors active:bg-slate-100 dark:text-slate-300 dark:active:bg-white/10"
          >
            {currentUser ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg theme-tonal font-display text-[11px] font-bold">
                {userInitials(currentUser.displayName)}
              </span>
            ) : (
              <User className="h-[18px] w-[18px]" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
