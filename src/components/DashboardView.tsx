import React, {useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ChevronRight,
  Film,
  FolderKanban,
  ImagePlus,
  LayoutGrid,
  Lightbulb,
  LightbulbOff,
  Moon,
  Plus,
  Radio,
  RefreshCw,
  Rows3,
  SlidersHorizontal,
  Sparkles,
  Sunrise,
  X,
} from 'lucide-react';
import type {
  ConnectionStatus,
  CustomMediaStore,
  DashboardGrouping,
  FhemConnectionConfig,
  FhemDevice,
  MediaPickerTarget,
  TileSize,
} from '../types/fhem';
import {resolveDeviceImage, resolveRoomImage} from '../lib/roomVisuals';
import {DeviceControlCard} from './DeviceControlCard';
import {ServerHealthCard} from './ServerHealthCard';
import {SmartVisualImage} from './SmartVisualImage';

interface DashboardViewProps {
  devices: FhemDevice[];
  config: FhemConnectionConfig;
  connectionStatus?: ConnectionStatus;
  favorites: string[];
  compactCards: boolean;
  tileSizes: Record<string, TileSize>;
  dashboardGrouping: DashboardGrouping;
  showZigbeeMetrics: boolean;
  showVisuals: boolean;
  customMedia: CustomMediaStore;
  refreshing: boolean;
  isMobileView?: boolean;
  onRefresh: () => Promise<void>;
  onCommand: (cmd: string) => void;
  onOpenDetail: (device: FhemDevice) => void;
  onOpenMediaPicker: (target: MediaPickerTarget) => void;
  onToggleFavorite: (deviceName: string) => void;
  onMoveFavorite: (deviceName: string, direction: 'up' | 'down') => void;
  onReorderFavorites: (sourceName: string, targetName: string) => void;
  onToggleTileSize: (deviceName: string) => void;
  onToggleCompactCards: () => void;
  onChangeGrouping: (grouping: DashboardGrouping) => void;
  onSyncFromAppOptions: () => void;
  onJumpToRoom: (room: string) => void;
  onJumpToCalendar: () => void;
  onJumpToErrors: () => void;
}

const PRIMARY_ROOMS = ['Wohnzimmer', 'Küche', 'Schlafzimmer', 'Büro', 'Bad', 'Flur', 'Garten', 'Technik'];

const TelemetryRing: React.FC<{ratio: number; strokeColor: string}> = ({ratio, strokeColor}) => {
  const clamped = Math.max(0, Math.min(1, ratio));
  const r = 15;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - clamped);
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0" aria-hidden="true">
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        className="text-slate-200 dark:text-white/10"
      />
      <circle
        cx="20"
        cy="20"
        r={r}
        fill="none"
        stroke={strokeColor}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        transform="rotate(-90 20 20)"
      />
    </svg>
  );
};

export const DashboardView: React.FC<DashboardViewProps> = ({
  devices,
  config,
  connectionStatus,
  favorites,
  compactCards,
  tileSizes,
  dashboardGrouping,
  showZigbeeMetrics,
  showVisuals,
  customMedia,
  refreshing,
  isMobileView = false,
  onRefresh,
  onCommand,
  onOpenDetail,
  onOpenMediaPicker,
  onToggleFavorite,
  onMoveFavorite,
  onReorderFavorites,
  onToggleTileSize,
  onToggleCompactCards,
  onChangeGrouping,
  onSyncFromAppOptions,
  onJumpToRoom,
  onJumpToCalendar,
  onJumpToErrors,
}) => {
  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [draggedName, setDraggedName] = useState<string | null>(null);
  const [dragOverName, setDragOverName] = useState<string | null>(null);

  // Pull-to-refresh touch handling
  const touchStartY = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY <= 4) {
      touchStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0 && window.scrollY <= 4) {
      setPullDistance(Math.min(84, delta * 0.45));
    }
  };

  const handleTouchEnd = () => {
    if (pullDistance > 52 && !refreshing) {
      void onRefresh();
    }
    touchStartY.current = null;
    setPullDistance(0);
  };

  const deviceByName = useMemo(() => {
    const map = new Map<string, FhemDevice>();
    for (const d of devices) map.set(d.name, d);
    return map;
  }, [devices]);

  const favoriteDevices = useMemo(
    () => favorites.map((name) => deviceByName.get(name)).filter((d): d is FhemDevice => Boolean(d)),
    [favorites, deviceByName]
  );

  const appOptionsDashboardCount = useMemo(
    () => devices.filter((d) => d.appOptions?.dashboard).length,
    [devices]
  );

  // Room-box grouping (EasyTiley room containers)
  const favoritesByRoom = useMemo(() => {
    const map = new Map<string, FhemDevice[]>();
    for (const dev of favoriteDevices) {
      const list = map.get(dev.primaryRoom) || [];
      list.push(dev);
      map.set(dev.primaryRoom, list);
    }
    return Array.from(map.entries());
  }, [favoriteDevices]);

  const roomSummaries = useMemo(() => {
    return PRIMARY_ROOMS.map((room) => {
      const inRoom = devices.filter((d) => d.primaryRoom === room);
      const temps = inRoom.map((d) => d.temperature).filter((t): t is number => t !== undefined);
      const avgTemp = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
      const lightsOn = inRoom.filter((d) => d.category === 'light' && d.statusTone === 'active').length;
      const openContacts = inRoom.filter((d) => d.readings.contact?.Value === 'open').length;
      const errors = inRoom.filter((d) => d.statusTone === 'error').length;
      return {room, count: inRoom.length, avgTemp, lightsOn, openContacts, errors};
    }).filter((r) => r.count > 0);
  }, [devices]);

  const metrics = useMemo(() => {
    const zigbee = devices.filter((d) => d.isZigbee);
    const errors = devices.filter((d) => d.statusTone === 'error');
    const lowBat = devices.filter((d) => d.battery !== undefined && d.battery <= 20);
    const lights = devices.filter((d) => d.category === 'light');
    const activeLights = lights.filter((d) => d.statusTone === 'active');
    const automations = devices.filter((d) => d.category === 'automation');
    const activeAutomations = automations.filter((d) => !d.disabled);
    const totalPower = devices.reduce((sum, d) => sum + (d.power && d.category === 'switch' ? d.power : 0), 0);
    return {
      total: devices.length,
      zigbeeCount: zigbee.length,
      errorCount: errors.length,
      lowBatCount: lowBat.length,
      lightsTotal: lights.length,
      activeLightsCount: activeLights.length,
      automationTotal: automations.length,
      automationActive: activeAutomations.length,
      totalPower,
    };
  }, [devices]);

  const pickerCandidates = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return devices
      .filter(
        (d) =>
          !q ||
          d.alias.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.primaryRoom.toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [devices, pickerSearch]);

  const quickScenes = [
    {
      label: 'Guten Morgen',
      icon: Sunrise,
      action: () => {
        onCommand('set HM_Rollladen_WZ_Terrasse pct 100');
        onCommand('set ZB_Plug_Kaffee on');
        onCommand('set Szene_Hausmodus Anwesend');
      },
    },
    {
      label: 'Kinoabend',
      icon: Film,
      action: () => {
        onCommand('set Szene_Wohnzimmer scene Kinoabend');
        onCommand('set HM_Rollladen_WZ_Links pct 0');
      },
    },
    {
      label: 'Alle Lichter aus',
      icon: LightbulbOff,
      action: () => onCommand('set Struktur_AlleLichter off'),
    },
    {
      label: 'Nachtmodus',
      icon: Moon,
      action: () => {
        onCommand('set Struktur_AlleLichter off');
        onCommand('set HM_Rollladen_SZ_Fenster pct 0');
        onCommand('set Szene_Hausmodus Nachtmodus');
      },
    },
  ];

  const resolveTileSize = (dev: FhemDevice): TileSize =>
    tileSizes[dev.name] ?? dev.appOptions?.size ?? 'sm';

  const handleDropTile = (targetName: string) => {
    if (draggedName && draggedName !== targetName) {
      onReorderFavorites(draggedName, targetName);
    }
    setDraggedName(null);
    setDragOverName(null);
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={isMobileView ? 'space-y-4 pb-6' : 'space-y-6 pb-8'}
    >
      {/* Pull-to-refresh visual indicator */}
      {pullDistance > 12 && (
        <div
          className="flex items-center justify-center gap-2 text-xs font-medium theme-text transition-transform"
          style={{height: `${pullDistance * 0.6}px`}}
        >
          <RefreshCw className={`h-4 w-4 ${pullDistance > 52 ? 'animate-spin' : ''}`} />
          <span>{pullDistance > 52 ? 'Loslassen zum Aktualisieren' : 'Nach unten ziehen zum Aktualisieren'}</span>
        </div>
      )}

      {/* Home Overview Strip — Dedicated Mobile vs Desktop Layout */}
      {isMobileView ? (
        <section aria-label="Systemübersicht" className="grid grid-cols-2 gap-2.5">
          <div className="min-w-0 rounded-2xl border theme-surface p-3.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Lichter aktiv
              </span>
              <Lightbulb className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            </div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums leading-tight text-emerald-600 dark:text-emerald-400">
              {metrics.activeLightsCount}
              <span className="text-xs font-medium text-slate-400">/{metrics.lightsTotal}</span>
            </div>
            <div className="mt-1 truncate text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {metrics.total} Geräte gesamt
            </div>
          </div>

          <div className="min-w-0 rounded-2xl border theme-surface p-3.5">
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                ZigBee Mesh
              </span>
              <Radio className="h-3.5 w-3.5 shrink-0 theme-text" />
            </div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums leading-tight text-slate-900 dark:text-slate-100">
              {metrics.zigbeeCount}
            </div>
            <div className="mt-1 truncate text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {metrics.lowBatCount > 0 ? `${metrics.lowBatCount} Batterie schwach` : 'Batterien OK'}
            </div>
          </div>

          <button
            type="button"
            onClick={onJumpToCalendar}
            className="min-w-0 rounded-2xl border theme-surface p-3.5 text-left transition-colors active:border-[var(--accent-ring)]"
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Automationen
              </span>
              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-indigo-500 dark:text-indigo-400" />
            </div>
            <div className="mt-1 font-display text-xl font-bold tabular-nums leading-tight text-slate-900 dark:text-slate-100">
              {metrics.automationActive}
              <span className="text-xs font-medium text-slate-400">/{metrics.automationTotal}</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-slate-500 dark:text-slate-400">
              at · DOIF · Timer
            </div>
          </button>

          <button
            type="button"
            onClick={onJumpToErrors}
            className={`min-w-0 rounded-2xl border bg-[var(--m3-surface)] p-3.5 text-left transition-colors ${
              metrics.errorCount > 0
                ? 'border-red-300/80 dark:border-red-500/40'
                : 'theme-border active:border-[var(--accent-ring)]'
            }`}
          >
            <div className="flex items-center justify-between gap-1.5">
              <span className="truncate text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Systemstatus
              </span>
              {metrics.errorCount > 0 && <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
            </div>
            <div
              className={`mt-1 truncate font-display text-xl font-bold tabular-nums leading-tight ${
                metrics.errorCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {metrics.errorCount > 0 ? `${metrics.errorCount} Störung` : 'Alles OK'}
            </div>
            <div className="mt-1 truncate text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              Leistung: <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{metrics.totalPower.toFixed(0)} W</span>
            </div>
          </button>
        </section>
      ) : (
        <section aria-label="Systemübersicht" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="flex items-center justify-between gap-2 rounded-2xl border theme-surface p-4">
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Aktive Lichter</div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {metrics.activeLightsCount}
                <span className="text-sm font-medium text-slate-400">/{metrics.lightsTotal}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {metrics.total} Geräte gesamt
              </div>
            </div>
            {showVisuals && (
              <TelemetryRing
                ratio={metrics.lightsTotal > 0 ? metrics.activeLightsCount / metrics.lightsTotal : 0}
                strokeColor="#10B981"
              />
            )}
          </div>

          <div className="flex items-center justify-between gap-2 rounded-2xl border theme-surface p-4">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ZigBee Mesh</span>
                <Radio className="h-3.5 w-3.5 theme-text" />
              </div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {metrics.zigbeeCount}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {metrics.lowBatCount > 0 ? `${metrics.lowBatCount} Batterie schwach` : 'Alle Batterien OK'}
              </div>
            </div>
            {showVisuals && (
              <TelemetryRing
                ratio={metrics.total > 0 ? metrics.zigbeeCount / metrics.total : 0}
                strokeColor="var(--accent-primary)"
              />
            )}
          </div>

          <button
            type="button"
            onClick={onJumpToCalendar}
            className="flex items-center justify-between gap-2 rounded-2xl border theme-surface p-4 text-left transition-colors hover:border-[var(--accent-ring)]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Automationen</span>
                <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
              </div>
              <div className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                {metrics.automationActive}/{metrics.automationTotal}
              </div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                at · DOIF · WeekdayTimer
              </div>
            </div>
            {showVisuals && (
              <TelemetryRing
                ratio={metrics.automationTotal > 0 ? metrics.automationActive / metrics.automationTotal : 0}
                strokeColor="#6366F1"
              />
            )}
          </button>

          <button
            type="button"
            onClick={onJumpToErrors}
            className={`flex flex-col justify-between rounded-2xl border bg-[var(--m3-surface)] p-4 text-left transition-colors ${
              metrics.errorCount > 0
                ? 'border-red-300/80 hover:border-red-400 dark:border-red-500/40'
                : 'theme-border hover:border-[var(--accent-ring)]'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Systemstatus</span>
              {metrics.errorCount > 0 && <AlertTriangle className="h-4 w-4 text-red-500" />}
            </div>
            <div
              className={`mt-1 font-display text-2xl font-bold tabular-nums ${
                metrics.errorCount > 0
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            >
              {metrics.errorCount > 0 ? `${metrics.errorCount} Störung` : 'Alles OK'}
            </div>
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                <span>Steckdosen</span>
                <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                  {metrics.totalPower.toFixed(0)} W
                </span>
              </div>
              {showVisuals && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, Math.max(6, (metrics.totalPower / 2500) * 100))}%`,
                      backgroundColor: metrics.totalPower > 1800 ? '#F59E0B' : 'var(--accent-primary)',
                    }}
                  />
                </div>
              )}
            </div>
          </button>
        </section>
      )}

      {/* FHEM Server Health Card (CPU, RAM, Uptime via FHEM ReadingsVal) */}
      <ServerHealthCard
        devices={devices}
        config={config}
        connectionStatus={connectionStatus}
        showVisuals={showVisuals}
        isMobileView={isMobileView}
        onOpenDetail={onOpenDetail}
      />

      {/* Quick Scenes */}
      <section aria-label="Schnellszenen">
        <div className="mb-2 flex items-center justify-between">
          <h2 className={`font-display font-semibold text-slate-900 dark:text-slate-100 ${isMobileView ? 'text-sm' : 'text-base'}`}>
            Schnellzugriff & Szenen
          </h2>
        </div>
        {isMobileView ? (
          <div className="flex gap-2 overflow-x-auto pb-1 snap-x">
            {quickScenes.map((scene) => {
              const Icon = scene.icon;
              return (
                <button
                  key={scene.label}
                  type="button"
                  onClick={scene.action}
                  className="flex min-h-[44px] shrink-0 snap-start items-center gap-2 rounded-2xl border theme-surface px-3 py-2 text-left text-xs font-semibold text-slate-800 whitespace-nowrap transition-colors active:scale-[0.98] dark:text-slate-100"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg theme-tonal">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span>{scene.label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {quickScenes.map((scene) => {
              const Icon = scene.icon;
              return (
                <button
                  key={scene.label}
                  type="button"
                  onClick={scene.action}
                  className="flex min-h-[52px] items-center gap-3 rounded-2xl border theme-surface px-4 py-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:border-[var(--accent-ring)] active:scale-[0.98] dark:text-slate-100"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl theme-tonal">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="truncate">{scene.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Primary Rooms Summary */}
      <section aria-label="Hauptraum-Übersicht">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className={`font-display font-semibold text-slate-900 dark:text-slate-100 ${isMobileView ? 'text-sm' : 'text-base'}`}>
            Hauptraum-Übersicht
          </h2>
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {isMobileView ? 'Wischen & tippen' : 'Tippen für Raumansicht'}
          </span>
        </div>
        <div
          className={
            isMobileView
              ? 'flex gap-2.5 overflow-x-auto pb-1 snap-x snap-mandatory'
              : 'grid grid-cols-2 lg:grid-cols-4 gap-3'
          }
        >
          {roomSummaries.map((r) => {
            const roomImg = showVisuals ? resolveRoomImage(r.room, customMedia) : null;
            if (showVisuals) {
              return (
                <button
                  key={r.room}
                  type="button"
                  onClick={() => onJumpToRoom(r.room)}
                  className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border theme-border p-3.5 text-left transition-all hover:border-[var(--accent-ring)] ${
                    isMobileView
                      ? 'h-36 w-[68vw] max-w-[235px] shrink-0 snap-start'
                      : 'h-40 min-w-0'
                  }`}
                >
                  <SmartVisualImage
                    src={roomImg?.src ?? null}
                    alt={`Raumansicht ${r.room}`}
                    label={r.room}
                    className="absolute inset-0 h-full w-full"
                    imgClassName="transition-transform duration-500 group-hover:scale-105"
                  />
                  {/* Measured WCAG AA contrast scrim over photography */}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

                  <div className="relative z-10 flex items-center justify-between gap-2 text-white">
                    <span className="font-display text-sm font-bold tracking-tight truncate drop-shadow-xs">
                      {r.room}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/80 transition-transform group-hover:translate-x-0.5" />
                  </div>

                  <div className="relative z-10 space-y-1 text-white">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`font-display font-bold tabular-nums drop-shadow-xs ${isMobileView ? 'text-xl' : 'text-2xl'}`}>
                        {r.avgTemp !== null ? `${r.avgTemp.toFixed(1)} °C` : `${r.count} Ger.`}
                      </span>
                      <span className="text-xs tabular-nums text-white/80 whitespace-nowrap">
                        {r.count} Geräte
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-white/85">
                      <span className={r.lightsOn > 0 ? 'font-semibold text-emerald-300' : ''}>
                        {r.lightsOn} Licht an
                      </span>
                      {r.openContacts > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-amber-300">
                            {r.openContacts} offen
                          </span>
                        </>
                      )}
                      {r.errors > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="font-semibold text-red-300">
                            {r.errors} Fehler
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={r.room}
                type="button"
                onClick={() => onJumpToRoom(r.room)}
                className={`flex flex-col justify-between rounded-2xl border theme-surface p-3.5 text-left transition-colors hover:border-[var(--accent-ring)] ${
                  isMobileView ? 'w-[62vw] max-w-[210px] shrink-0 snap-start' : 'min-w-0'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {r.room}
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                </div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-display text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {r.avgTemp !== null ? `${r.avgTemp.toFixed(1)} °C` : `${r.count} Ger.`}
                  </span>
                  <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {r.count} Ger.
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className={r.lightsOn > 0 ? 'font-medium text-emerald-600 dark:text-emerald-400' : ''}>
                    {r.lightsOn} Licht an
                  </span>
                  {r.openContacts > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        {r.openContacts} offen
                      </span>
                    </>
                  )}
                  {r.errors > 0 && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {r.errors} Fehler
                      </span>
                    </>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Optional User-Uploaded Floorplan / House Visual Banner */}
      {showVisuals && customMedia.floorplan && (
        <section aria-label="Haus-Grundriss" className="rounded-3xl border theme-surface overflow-hidden">
          <div className={`relative w-full ${isMobileView ? 'h-44' : 'h-56 sm:h-64'}`}>
            <SmartVisualImage
              src={customMedia.floorplan}
              alt="Eigener Haus-Grundriss"
              label="Grundriss"
              className="h-full w-full"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
            <div className="absolute bottom-3.5 left-3.5 right-3.5 flex items-end justify-between gap-3 text-white">
              <div className="min-w-0">
                <h2 className="font-display text-sm sm:text-base font-bold truncate">Haus-Grundriss & Ansicht</h2>
                <p className="text-[11px] sm:text-xs text-white/80 truncate">Eigenes Dashboard-Bild aus dem lokalen Medienspeicher</p>
              </div>
              <button
                type="button"
                onClick={() => onOpenMediaPicker({kind: 'floorplan', key: 'floorplan', label: 'Haus-Grundriss'})}
                className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-black/60 px-3 text-xs font-semibold text-white backdrop-blur-xs hover:bg-black/80 shrink-0"
              >
                <ImagePlus className="h-3.5 w-3.5" />
                <span>Ändern</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Customizable Favorite Widgets (EasyTiley + fhemApp appOptions) */}
      <section aria-label="Favoriten-Kacheln">
        {isMobileView ? (
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  Favoriten ({favoriteDevices.length})
                </h2>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {editMode
                    ? 'Sortieren, gruppieren oder Kachelgröße ändern'
                    : dashboardGrouping === 'rooms'
                      ? 'Nach Räumen gruppiert'
                      : 'Direktzugriff auf deine wichtigsten Geräte'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  aria-label="Favorit hinzufügen"
                  className="flex h-10 w-10 items-center justify-center rounded-xl theme-tonal transition-opacity active:opacity-80"
                >
                  <Plus className="h-4.5 w-4.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                    editMode
                      ? 'theme-btn-primary'
                      : 'theme-surface-alt text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {editMode ? <Check className="h-4 w-4" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
                  <span>{editMode ? 'Fertig' : 'Anpassen'}</span>
                </button>
              </div>
            </div>

            {/* Secondary edit options revealed only when customizing on mobile */}
            {editMode && (
              <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border theme-border bg-[var(--m3-surface)] p-2">
                <div className="inline-flex rounded-xl border theme-border bg-[var(--m3-canvas)] p-0.5">
                  <button
                    type="button"
                    onClick={() => onChangeGrouping('grid')}
                    className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${
                      dashboardGrouping === 'grid' ? 'theme-tonal' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    <span>Liste</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onChangeGrouping('rooms')}
                    className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold ${
                      dashboardGrouping === 'rooms' ? 'theme-tonal' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    <FolderKanban className="h-3.5 w-3.5" />
                    <span>Räume</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onToggleCompactCards}
                  className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold ${
                    compactCards
                      ? 'theme-tonal border border-[var(--accent-ring)]'
                      : 'theme-surface-alt text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <Rows3 className="h-3.5 w-3.5" />
                  <span>Kompakt</span>
                </button>

                {appOptionsDashboardCount > 0 && (
                  <button
                    type="button"
                    onClick={onSyncFromAppOptions}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl theme-surface-alt px-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    <Sparkles className="h-3.5 w-3.5 theme-text" />
                    <span>appOptions</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Favoriten-Kacheln
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {editMode
                  ? 'Kacheln per Drag & Drop sortieren oder zwischen 1×1 und 2×1 Breite umschalten'
                  : `${favoriteDevices.length} angeheftet · ${dashboardGrouping === 'rooms' ? 'Raum-Boxen' : 'Freies Raster'}${compactCards ? ' · Tablet-Kompakt' : ''}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Grid vs Room-Boxes Grouping Toggle (EasyTiley) */}
              <div className="inline-flex rounded-xl border theme-border bg-[var(--m3-surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => onChangeGrouping('grid')}
                  title="Freies Kachelraster"
                  className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    dashboardGrouping === 'grid'
                      ? 'theme-tonal'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Kacheln</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeGrouping('rooms')}
                  title="Nach Raum-Boxen gruppieren"
                  className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
                    dashboardGrouping === 'rooms'
                      ? 'theme-tonal'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <FolderKanban className="h-3.5 w-3.5" />
                  <span>Raum-Boxen</span>
                </button>
              </div>

              {/* Wall-Tablet Compact Density Toggle */}
              <button
                type="button"
                onClick={onToggleCompactCards}
                title="Kompakte Wand-Tablet-Ansicht umschalten"
                className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  compactCards
                    ? 'theme-tonal border border-[var(--accent-ring)]'
                    : 'theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-200'
                }`}
              >
                <Rows3 className="h-3.5 w-3.5" />
                <span>Kompakt</span>
              </button>

              {/* fhemApp appOptions Sync Button */}
              {appOptionsDashboardCount > 0 && (
                <button
                  type="button"
                  onClick={onSyncFromAppOptions}
                  title={`Übernimmt ${appOptionsDashboardCount} FHEM-Geräte mit appOptions.dashboard=true inkl. Größe`}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl theme-surface-alt px-3 text-xs font-semibold text-slate-700 hover:opacity-85 dark:text-slate-200 whitespace-nowrap"
                >
                  <Sparkles className="h-3.5 w-3.5 theme-text" />
                  <span>appOptions</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl theme-tonal px-3 text-xs font-semibold hover:opacity-90 transition-opacity whitespace-nowrap"
              >
                <Plus className="h-4 w-4" />
                Hinzufügen
              </button>
              <button
                type="button"
                onClick={() => setEditMode((v) => !v)}
                className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                  editMode
                    ? 'theme-btn-primary'
                    : 'theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-200'
                }`}
              >
                {editMode ? <Check className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
                {editMode ? 'Fertig' : 'Anpassen'}
              </button>
            </div>
          </div>
        )}

        {favoriteDevices.length === 0 ? (
          <div className="rounded-2xl border border-dashed theme-surface p-8 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Noch keine Favoriten angeheftet.
            </p>
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-3 min-h-[44px] rounded-xl theme-btn-primary px-4 text-xs font-semibold transition-colors"
            >
              Erste Favoriten auswählen
            </button>
          </div>
        ) : dashboardGrouping === 'rooms' && !editMode ? (
          /* EasyTiley Room-Box Grouping Layout */
          <div className="space-y-3.5">
            {favoritesByRoom.map(([room, roomDevs]) => (
              <div key={room} className="rounded-3xl border theme-surface p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-center justify-between px-1">
                  <button
                    type="button"
                    onClick={() => onJumpToRoom(room)}
                    className="flex items-center gap-2 font-display text-sm font-semibold text-slate-900 hover:underline dark:text-slate-100"
                  >
                    <span>{room}</span>
                    <span className="font-mono text-xs font-normal text-slate-500 dark:text-slate-400">
                      ({roomDevs.length})
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onJumpToRoom(room)}
                    className="text-xs font-medium theme-text hover:underline"
                  >
                    Alle im Raum
                  </button>
                </div>
                <div
                  className={
                    isMobileView
                      ? 'grid grid-cols-1 gap-2.5'
                      : `grid grid-cols-1 sm:grid-cols-2 ${
                          compactCards ? 'lg:grid-cols-3 xl:grid-cols-4 gap-2.5' : 'xl:grid-cols-3 gap-3'
                        }`
                  }
                >
                  {roomDevs.map((dev) => (
                    <DeviceControlCard
                      key={dev.name}
                      device={dev}
                      isFavorite
                      compact={compactCards}
                      tileSize={isMobileView ? 'sm' : resolveTileSize(dev)}
                      showZigbeeMetrics={showZigbeeMetrics}
                      deviceImage={showVisuals ? resolveDeviceImage(dev, customMedia).src : null}
                      onOpenDetail={onOpenDetail}
                      onCommand={onCommand}
                      onToggleFavorite={onToggleFavorite}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Standard & Editable Drag-and-Drop Tile Grid */
          <div
            className={
              isMobileView
                ? 'grid grid-cols-1 gap-2.5'
                : `grid grid-cols-1 sm:grid-cols-2 ${
                    compactCards ? 'lg:grid-cols-3 xl:grid-cols-4 gap-2.5' : 'xl:grid-cols-3 gap-3'
                  }`
            }
          >
            {favoriteDevices.map((dev, index) => (
              <DeviceControlCard
                key={dev.name}
                device={dev}
                isFavorite
                editMode={editMode}
                compact={compactCards}
                tileSize={isMobileView ? 'sm' : resolveTileSize(dev)}
                canMoveUp={index > 0}
                canMoveDown={index < favoriteDevices.length - 1}
                showZigbeeMetrics={showZigbeeMetrics}
                deviceImage={showVisuals ? resolveDeviceImage(dev, customMedia).src : null}
                isDragOver={dragOverName === dev.name && draggedName !== dev.name}
                onOpenDetail={onOpenDetail}
                onCommand={onCommand}
                onToggleFavorite={onToggleFavorite}
                onMoveFavorite={onMoveFavorite}
                onToggleTileSize={onToggleTileSize}
                onDragStartTile={(name) => setDraggedName(name)}
                onDragOverTile={(name) => setDragOverName(name)}
                onDropTile={handleDropTile}
                onDragEndTile={() => {
                  setDraggedName(null);
                  setDragOverName(null);
                }}
              />
            ))}
          </div>
        )}
      </section>

      {/* Favorite Picker Modal */}
      {pickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-0 sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Favoriten auswählen"
          onClick={(e) => {
            if (e.target === e.currentTarget) setPickerOpen(false);
          }}
        >
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border theme-surface shadow-2xl">
            <div className="flex items-center justify-between border-b theme-border px-5 py-4">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Favoriten-Kacheln auswählen
              </h3>
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 border-b theme-border">
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Gerät oder Raum suchen..."
                className="min-h-[44px] w-full rounded-xl border theme-border bg-white px-3.5 text-sm text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
              />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06]">
              {pickerCandidates.map((d) => {
                const pinned = favorites.includes(d.name);
                return (
                  <button
                    key={d.name}
                    type="button"
                    onClick={() => onToggleFavorite(d.name)}
                    className="flex min-h-[56px] w-full items-center justify-between gap-3 px-5 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {d.alias}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {d.primaryRoom} · {d.type} · {d.statusLabel}
                      </div>
                    </div>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                        pinned ? 'theme-btn-primary' : 'theme-surface-alt text-slate-400'
                      }`}
                    >
                      {pinned ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
