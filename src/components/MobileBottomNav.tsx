import React from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChevronRight,
  Cpu,
  DoorOpen,
  LayoutDashboard,
  LineChart,
  Menu,
  Monitor,
  Moon,
  Palette,
  Save,
  Settings,
  Smartphone,
  Sparkles,
  Sun,
  User,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type {ActiveTab, ColorThemeId, ConnectionStatus, UserAccount, ViewMode} from '../types/fhem';
import {COLOR_THEMES} from '../lib/themes';
import {useOnlineStatus} from '../hooks/usePWAInstall';

interface MobileBottomNavProps {
  activeTab: ActiveTab;
  status: ConnectionStatus;
  currentUser: UserAccount | null;
  errorCount: number;
  scheduleCount: number;
  theme: 'dark' | 'light';
  colorTheme: ColorThemeId;
  viewMode: ViewMode;
  menuOpen: boolean;
  onSetMenuOpen: (open: boolean) => void;
  onSelectTab: (tab: ActiveTab) => void;
  onToggleTheme: () => void;
  onOpenThemePicker: () => void;
  onOpenSaveConfig: () => void;
  onOpenAccount: () => void;
  onChangeViewMode: (mode: ViewMode) => void;
}

const PRIMARY_MOBILE_TABS: Array<{
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{className?: string}>;
}> = [
  {id: 'dashboard', label: 'Home', icon: LayoutDashboard},
  {id: 'rooms', label: 'Räume', icon: DoorOpen},
  {id: 'devices', label: 'Geräte', icon: Cpu},
  {id: 'charts', label: 'Charts', icon: LineChart},
];

const SECONDARY_TABS: ActiveTab[] = ['calendar', 'assistant', 'settings'];

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  status,
  currentUser,
  errorCount,
  scheduleCount,
  theme,
  colorTheme,
  viewMode,
  menuOpen,
  onSetMenuOpen,
  onSelectTab,
  onToggleTheme,
  onOpenThemePicker,
  onOpenSaveConfig,
  onOpenAccount,
  onChangeViewMode,
}) => {
  const browserOnline = useOnlineStatus();
  const effectiveOnline = browserOnline && status.online;
  const isSecondaryActive = SECONDARY_TABS.includes(activeTab);

  const navigateFromSheet = (tab: ActiveTab) => {
    onSetMenuOpen(false);
    onSelectTab(tab);
  };

  return (
    <>
      {/* Mobile Thumb-Zone Bottom Bar (60px height + safe area) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 border-t theme-border bg-[var(--m3-surface)]/95 backdrop-blur-md pb-safe"
      >
        <div className="mx-auto grid h-[60px] max-w-2xl grid-cols-5 items-center px-1">
          {PRIMARY_MOBILE_TABS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id && !menuOpen;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onSetMenuOpen(false);
                  onSelectTab(item.id);
                }}
                className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 focus-visible:outline-none"
              >
                <span
                  className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                    active ? 'theme-tonal' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Icon className="h-[19px] w-[19px]" />
                  {item.id === 'devices' && errorCount > 0 && (
                    <span
                      className="absolute right-2.5 top-0.5 h-2 w-2 rounded-full bg-red-500"
                      aria-label={`${errorCount} Fehler`}
                    />
                  )}
                </span>
                <span
                  className={`text-[10px] leading-none whitespace-nowrap ${
                    active ? 'font-semibold theme-text' : 'font-medium text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}

          {/* 5th Tab: More / Menu Sheet Trigger */}
          <button
            type="button"
            onClick={() => onSetMenuOpen(!menuOpen)}
            aria-expanded={menuOpen}
            aria-label="Menü und weitere Bereiche öffnen"
            className="flex min-h-[48px] flex-col items-center justify-center gap-0.5 focus-visible:outline-none"
          >
            <span
              className={`relative flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                menuOpen || isSecondaryActive ? 'theme-tonal' : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Menu className="h-[19px] w-[19px]" />
              {status.unsavedChanges && (
                <span
                  className="absolute right-2.5 top-0.5 h-2 w-2 rounded-full bg-amber-500"
                  aria-label="Ungespeicherte Änderungen"
                />
              )}
            </span>
            <span
              className={`text-[10px] leading-none whitespace-nowrap ${
                menuOpen || isSecondaryActive
                  ? 'font-semibold theme-text'
                  : 'font-medium text-slate-500 dark:text-slate-400'
              }`}
            >
              Menü
            </span>
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Action Sheet ("Mehr"-Menü) */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-label="Mobiles Menü"
          onClick={(e) => {
            if (e.target === e.currentTarget) onSetMenuOpen(false);
          }}
        >
          <div className="flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t theme-surface shadow-2xl pb-safe">
            {/* Grab Handle */}
            <div className="flex justify-center pt-2.5 pb-1">
              <div className="h-1.5 w-10 rounded-full bg-slate-300 dark:bg-white/20" aria-hidden="true" />
            </div>

            <div className="flex items-center justify-between border-b theme-border px-5 pb-3 pt-1">
              <div className="flex items-center gap-2.5">
                <img
                  src="/icon.svg"
                  alt="FHEM Control Desk"
                  className="h-7 w-7 rounded-lg"
                  referrerPolicy="no-referrer"
                />
                <span className="font-display text-base font-bold text-slate-900 dark:text-slate-100">
                  FHEM Control Desk
                </span>
              </div>
              <button
                type="button"
                onClick={() => onSetMenuOpen(false)}
                aria-label="Menü schließen"
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              {/* Live Connection Status Card */}
              <div className="rounded-2xl border theme-border bg-[var(--m3-canvas)] p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    {effectiveOnline ? (
                      <Wifi className="h-4 w-4 text-emerald-500 shrink-0" />
                    ) : (
                      <WifiOff className="h-4 w-4 text-red-500 shrink-0" />
                    )}
                    <span
                      className={
                        effectiveOnline
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-red-600 dark:text-red-400'
                      }
                    >
                      {!browserOnline ? 'Gerät offline' : effectiveOnline ? 'FHEM verbunden' : 'FHEM getrennt'}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                    {status.latencyMs !== null ? `${status.latencyMs} ms` : '—'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                  <span>
                    {status.configMode === 'local_instance' ? 'Lokale Test-Instanz' : 'FHEM-Server'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {status.longpollState === 'connected'
                      ? 'Longpoll aktiv'
                      : status.longpollState === 'reconnecting' || status.longpollState === 'connecting'
                        ? 'Longpoll verbindet…'
                        : 'Polling'}
                  </span>
                  {status.fhemVersion && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{status.fhemVersion}</span>
                    </>
                  )}
                </div>

                {status.unsavedChanges && (
                  <button
                    type="button"
                    onClick={() => {
                      onSetMenuOpen(false);
                      onOpenSaveConfig();
                    }}
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-500/15 px-3 text-xs font-semibold text-amber-800 dark:text-amber-300"
                  >
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>Änderungen in fhem.cfg speichern</span>
                    <Save className="h-3.5 w-3.5 shrink-0" />
                  </button>
                )}
              </div>

              {/* Secondary App Destinations (2x2 Big Touch Grid) */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => navigateFromSheet('calendar')}
                  className={`flex min-h-[68px] flex-col justify-between rounded-2xl border p-3.5 text-left transition-colors ${
                    activeTab === 'calendar'
                      ? 'border-[var(--accent-ring)] theme-tonal'
                      : 'theme-border bg-[var(--m3-canvas)]/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <CalendarClock className="h-5 w-5 theme-text" />
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      {scheduleCount}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Kalender & Timer
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateFromSheet('assistant')}
                  className={`flex min-h-[68px] flex-col justify-between rounded-2xl border p-3.5 text-left transition-colors ${
                    activeTab === 'assistant'
                      ? 'border-[var(--accent-ring)] theme-tonal'
                      : 'theme-border bg-[var(--m3-canvas)]/70'
                  }`}
                >
                  <Sparkles className="h-5 w-5 theme-text" />
                  <div className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    KI-Assistent
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateFromSheet('settings')}
                  className={`flex min-h-[68px] flex-col justify-between rounded-2xl border p-3.5 text-left transition-colors ${
                    activeTab === 'settings'
                      ? 'border-[var(--accent-ring)] theme-tonal'
                      : 'theme-border bg-[var(--m3-canvas)]/70'
                  }`}
                >
                  <Settings className="h-5 w-5 theme-text" />
                  <div className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Einstellungen
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSetMenuOpen(false);
                    onOpenThemePicker();
                  }}
                  className="flex min-h-[68px] flex-col justify-between rounded-2xl border theme-border bg-[var(--m3-canvas)]/70 p-3.5 text-left transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <Palette className="h-5 w-5 theme-text" />
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {COLOR_THEMES.find((t) => t.id === colorTheme)?.name}
                    </span>
                  </div>
                  <div className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                    Farbtheme & Design
                  </div>
                </button>
              </div>

              {/* Device View Mode Switcher (Auto / Mobil / Desktop) */}
              <div className="rounded-2xl border theme-border bg-[var(--m3-canvas)] p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">Ansichtsmodus</span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Geräteabhängig</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5 rounded-xl border theme-border bg-[var(--m3-surface)] p-1">
                  {(
                    [
                      {id: 'auto', label: 'Auto', icon: Smartphone},
                      {id: 'mobile', label: 'Mobil', icon: Smartphone},
                      {id: 'desktop', label: 'Desktop', icon: Monitor},
                    ] as const
                  ).map((opt) => {
                    const Icon = opt.icon;
                    const active = viewMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          onChangeViewMode(opt.id);
                          if (opt.id === 'desktop') onSetMenuOpen(false);
                        }}
                        className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          active
                            ? 'theme-tonal'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Theme Toggle + Account Row */}
              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={onToggleTheme}
                  className="flex min-h-[48px] w-full items-center justify-between rounded-2xl theme-surface-alt px-4 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <span className="flex items-center gap-2.5">
                    {theme === 'dark' ? (
                      <Moon className="h-4 w-4 theme-text" />
                    ) : (
                      <Sun className="h-4 w-4 text-amber-500" />
                    )}
                    <span>{theme === 'dark' ? 'Dunkelmodus aktiv' : 'Heller Modus aktiv'}</span>
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">Wechseln</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onSetMenuOpen(false);
                    onOpenAccount();
                  }}
                  className="flex min-h-[48px] w-full items-center justify-between rounded-2xl border theme-border bg-[var(--m3-canvas)]/70 px-4 text-left"
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <User className="h-4 w-4 theme-text shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {currentUser ? currentUser.displayName : 'Anmelden / Profil'}
                      </span>
                      {currentUser && (
                        <span className="block text-[11px] text-slate-500 dark:text-slate-400">
                          {currentUser.role === 'admin' ? 'Administrator' : 'Benutzer'} · Profil-Sync
                        </span>
                      )}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
