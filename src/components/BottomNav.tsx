import React, {useState} from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Cpu,
  DoorOpen,
  LayoutDashboard,
  LineChart,
  Monitor,
  Moon,
  Settings,
  Smartphone,
  Sparkles,
  Sun,
} from 'lucide-react';
import type {ActiveTab, ColorThemeId, ViewMode} from '../types/fhem';
import {COLOR_THEMES} from '../lib/themes';

export interface SidebarRoomItem {
  name: string;
  count: number;
  lightsOn: number;
  errors: number;
}

interface NavProps {
  activeTab: ActiveTab;
  selectedRoom: string | null;
  rooms: SidebarRoomItem[];
  onSelectTab: (tab: ActiveTab) => void;
  onSelectRoom: (room: string) => void;
  deviceCount: number;
  errorCount: number;
  scheduleCount: number;
  chartableCount: number;
  theme: 'dark' | 'light';
  colorTheme: ColorThemeId;
  viewMode: ViewMode;
  onToggleTheme: () => void;
  onSelectColorTheme: (id: ColorThemeId) => void;
  onChangeViewMode: (mode: ViewMode) => void;
}

const DESKTOP_NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: React.ComponentType<{className?: string}>;
}> = [
  {id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard},
  {id: 'rooms', label: 'Räume', icon: DoorOpen},
  {id: 'devices', label: 'Geräte', icon: Cpu},
  {id: 'calendar', label: 'Kalender', icon: CalendarClock},
  {id: 'charts', label: 'Diagramme', icon: LineChart},
  {id: 'assistant', label: 'KI-Assistent', icon: Sparkles},
  {id: 'settings', label: 'Einstellungen', icon: Settings},
];

export const BottomNav: React.FC<NavProps> = ({
  activeTab,
  selectedRoom,
  rooms,
  onSelectTab,
  onSelectRoom,
  deviceCount,
  errorCount,
  scheduleCount,
  chartableCount,
  theme,
  colorTheme,
  viewMode,
  onToggleTheme,
  onSelectColorTheme,
  onChangeViewMode,
}) => {
  const [roomsExpanded, setRoomsExpanded] = useState(true);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r theme-surface">
      <div className="flex h-14 shrink-0 items-center gap-3 px-5 border-b theme-border">
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

        <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-4" aria-label="Hauptnavigation">
          {DESKTOP_NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const countText =
              item.id === 'devices'
                ? String(deviceCount)
                : item.id === 'rooms'
                  ? String(rooms.length)
                  : item.id === 'calendar'
                    ? String(scheduleCount)
                    : item.id === 'charts'
                      ? String(chartableCount)
                      : undefined;

            return (
              <div key={item.id}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={`flex min-h-[46px] flex-1 items-center justify-between rounded-2xl px-4 text-sm font-medium transition-colors whitespace-nowrap ${
                      active
                        ? 'theme-tonal font-semibold'
                        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]'
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0" />
                      <span>{item.label}</span>
                    </span>
                    <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
                      {item.id === 'devices' && errorCount > 0 && (
                        <span className="text-red-600 dark:text-red-400 font-semibold">
                          {errorCount} Fehler
                        </span>
                      )}
                      {countText && <span className="opacity-65">{countText}</span>}
                    </span>
                  </button>

                  {item.id === 'rooms' && rooms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRoomsExpanded((v) => !v)}
                      aria-label={roomsExpanded ? 'Raumliste einklappen' : 'Raumliste ausklappen'}
                      className="flex h-10 w-8 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/[0.06] dark:hover:text-slate-200"
                    >
                      {roomsExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>

                {/* Direct Room Sub-Navigation in Left Sidebar */}
                {item.id === 'rooms' && roomsExpanded && rooms.length > 0 && (
                  <div className="mt-1 mb-2 ml-4 space-y-0.5 border-l theme-border pl-2.5">
                    {rooms.map((room) => {
                      const roomActive = activeTab === 'rooms' && selectedRoom === room.name;
                      return (
                        <button
                          key={room.name}
                          type="button"
                          onClick={() => onSelectRoom(room.name)}
                          className={`flex min-h-[36px] w-full items-center justify-between rounded-xl px-2.5 text-xs transition-colors ${
                            roomActive
                              ? 'theme-tonal font-semibold'
                              : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.05] dark:hover:text-slate-200'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2 truncate">
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                room.errors > 0
                                  ? 'bg-red-500'
                                  : room.lightsOn > 0
                                    ? 'bg-emerald-500'
                                    : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            />
                            <span className="truncate">{room.name}</span>
                          </span>
                          <span className="ml-2 font-mono text-[11px] tabular-nums opacity-65">
                            {room.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Quick Color Theme Swatches & Dark/Light Switch */}
        <div className="shrink-0 border-t theme-border p-4 space-y-3">
          <div>
            <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Farbtheme</span>
              <span>{COLOR_THEMES.find((t) => t.id === colorTheme)?.name}</span>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {COLOR_THEMES.map((t) => {
                const selected = colorTheme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectColorTheme(t.id)}
                    title={t.name}
                    aria-label={`Theme ${t.name}`}
                    className={`flex h-8 w-8 items-center justify-center rounded-full transition-transform ${
                      selected
                        ? 'ring-2 ring-offset-2 ring-offset-[var(--m3-surface)] ring-[var(--accent-ring)] scale-105'
                        : 'hover:scale-105 opacity-80 hover:opacity-100'
                    }`}
                    style={{backgroundColor: t.swatchPrimary}}
                  />
                );
              })}
            </div>
          </div>

          {/* Device View Mode Switcher */}
          <div className="grid grid-cols-3 gap-1 rounded-xl border theme-border bg-[var(--m3-canvas)] p-0.5">
            {(
              [
                {id: 'auto', label: 'Auto', icon: Monitor},
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
                  onClick={() => onChangeViewMode(opt.id)}
                  title={`Ansicht: ${opt.label}`}
                  className={`flex min-h-[32px] items-center justify-center gap-1 rounded-lg text-[11px] font-semibold transition-colors ${
                    active
                      ? 'theme-tonal'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="flex min-h-[42px] w-full items-center justify-between rounded-2xl theme-surface-alt px-4 text-sm font-medium text-slate-700 transition-colors hover:opacity-90 dark:text-slate-200"
          >
            <span className="flex items-center gap-2.5">
              {theme === 'dark' ? <Moon className="h-4 w-4 theme-text" /> : <Sun className="h-4 w-4 text-amber-500" />}
              <span>{theme === 'dark' ? 'Dunkelmodus' : 'Heller Modus'}</span>
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">Wechseln</span>
          </button>
        </div>
      </aside>
  );
};
