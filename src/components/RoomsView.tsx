import React, {useMemo, useState} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BedDouble,
  Blinds,
  Camera,
  ChevronRight,
  Cpu,
  DoorOpen,
  Droplets,
  Home,
  Lamp,
  Laptop,
  LayoutGrid,
  Lightbulb,
  LightbulbOff,
  List,
  Plug,
  Power,
  Radio,
  Search,
  Server,
  Star,
  Thermometer,
  Trees,
  UtensilsCrossed,
  Zap,
} from 'lucide-react';
import type {CustomMediaStore, DeviceCategory, FhemDevice, MediaPickerTarget} from '../types/fhem';
import {resolveDeviceImage, resolveRoomImage} from '../lib/roomVisuals';
import {DeviceControlCard} from './DeviceControlCard';
import {SmartVisualImage} from './SmartVisualImage';

interface RoomsViewProps {
  devices: FhemDevice[];
  favorites: string[];
  selectedRoom: string | null;
  showZigbeeMetrics: boolean;
  showVisuals: boolean;
  customMedia: CustomMediaStore;
  onSelectRoom: (room: string | null) => void;
  onOpenDetail: (device: FhemDevice) => void;
  onOpenMediaPicker: (target: MediaPickerTarget) => void;
  onCommand: (cmd: string) => void;
  onToggleFavorite: (deviceName: string) => void;
}

const VIRTUAL_TAG_ROOMS = new Set(['ZigBee', 'Sensoren', 'Rollläden', 'Klima', 'Szenen', 'Automatisierung']);

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  light: 'Beleuchtung',
  shutter: 'Rollläden & Beschattung',
  climate: 'Klima & Heizung',
  switch: 'Steckdosen & Schalter',
  sensor: 'Sensoren & Kontakte',
  scene: 'Szenen & Gruppen',
  automation: 'Automationen',
  system: 'System',
};

export function getRoomIcon(room: string): React.ComponentType<{className?: string}> {
  const lower = room.toLowerCase();
  if (lower.includes('wohn')) return Lamp;
  if (lower.includes('küch') || lower.includes('kuech')) return UtensilsCrossed;
  if (lower.includes('schlaf') || lower.includes('kinder') || lower.includes('gast')) return BedDouble;
  if (lower.includes('büro') || lower.includes('buero') || lower.includes('arbeit')) return Laptop;
  if (lower.includes('bad') || lower.includes('wc')) return Droplets;
  if (lower.includes('garten') || lower.includes('terrasse') || lower.includes('balkon')) return Trees;
  if (lower.includes('technik') || lower.includes('keller') || lower.includes('server')) return Server;
  if (lower.includes('flur') || lower.includes('diele') || lower.includes('eingang')) return DoorOpen;
  if (lower.includes('zigbee')) return Radio;
  return Home;
}

interface RoomSummary {
  name: string;
  isVirtualTag: boolean;
  devices: FhemDevice[];
  avgTemp: number | null;
  avgHumidity: number | null;
  lightsOn: number;
  lightsTotal: number;
  shuttersTotal: number;
  openContacts: number;
  errors: number;
  totalPower: number;
}

export const RoomsView: React.FC<RoomsViewProps> = ({
  devices,
  favorites,
  selectedRoom,
  showZigbeeMetrics,
  showVisuals,
  customMedia,
  onSelectRoom,
  onOpenDetail,
  onOpenMediaPicker,
  onCommand,
  onToggleFavorite,
}) => {
  const [includeTagRooms, setIncludeTagRooms] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [roomSearch, setRoomSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<DeviceCategory | 'all'>('all');

  const rooms = useMemo<RoomSummary[]>(() => {
    const map = new Map<string, FhemDevice[]>();

    for (const dev of devices) {
      const targetRooms = includeTagRooms ? dev.rooms : [dev.primaryRoom];
      for (const r of targetRooms) {
        if (!r) continue;
        const list = map.get(r) || [];
        if (!list.some((existing) => existing.name === dev.name)) {
          list.push(dev);
        }
        map.set(r, list);
      }
    }

    return Array.from(map.entries())
      .map(([name, roomDevices]) => {
        const temps = roomDevices.map((d) => d.temperature).filter((t): t is number => t !== undefined);
        const hums = roomDevices.map((d) => d.humidity).filter((h): h is number => h !== undefined);
        const lights = roomDevices.filter((d) => d.category === 'light');
        const lightsOn = lights.filter((d) => d.statusTone === 'active').length;
        const shuttersTotal = roomDevices.filter((d) => d.isShutter).length;
        const openContacts = roomDevices.filter((d) => d.readings.contact?.Value === 'open').length;
        const errors = roomDevices.filter((d) => d.statusTone === 'error').length;
        const totalPower = roomDevices.reduce((sum, d) => sum + (d.power || 0), 0);

        return {
          name,
          isVirtualTag: VIRTUAL_TAG_ROOMS.has(name),
          devices: roomDevices,
          avgTemp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
          avgHumidity: hums.length ? hums.reduce((a, b) => a + b, 0) / hums.length : null,
          lightsOn,
          lightsTotal: lights.length,
          shuttersTotal,
          openContacts,
          errors,
          totalPower,
        };
      })
      .sort((a, b) => {
        if (a.isVirtualTag !== b.isVirtualTag) return a.isVirtualTag ? 1 : -1;
        return a.name.localeCompare(b.name, 'de');
      });
  }, [devices, includeTagRooms]);

  const activeRoom = useMemo(() => {
    if (!rooms.length) return null;
    if (selectedRoom) {
      const found = rooms.find((r) => r.name === selectedRoom);
      if (found) return found;
      // If a tag room was selected directly, build its summary on the fly
      const matchedDevices = devices.filter(
        (d) => d.primaryRoom === selectedRoom || d.rooms.includes(selectedRoom)
      );
      if (matchedDevices.length > 0) {
        const temps = matchedDevices.map((d) => d.temperature).filter((t): t is number => t !== undefined);
        const hums = matchedDevices.map((d) => d.humidity).filter((h): h is number => h !== undefined);
        const lights = matchedDevices.filter((d) => d.category === 'light');
        return {
          name: selectedRoom,
          isVirtualTag: VIRTUAL_TAG_ROOMS.has(selectedRoom),
          devices: matchedDevices,
          avgTemp: temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null,
          avgHumidity: hums.length ? hums.reduce((a, b) => a + b, 0) / hums.length : null,
          lightsOn: lights.filter((d) => d.statusTone === 'active').length,
          lightsTotal: lights.length,
          shuttersTotal: matchedDevices.filter((d) => d.isShutter).length,
          openContacts: matchedDevices.filter((d) => d.readings.contact?.Value === 'open').length,
          errors: matchedDevices.filter((d) => d.statusTone === 'error').length,
          totalPower: matchedDevices.reduce((sum, d) => sum + (d.power || 0), 0),
        };
      }
    }
    return rooms[0];
  }, [rooms, selectedRoom, devices]);

  const activeRoomCategories = useMemo(() => {
    if (!activeRoom) return [];
    const counts = new Map<DeviceCategory, number>();
    for (const d of activeRoom.devices) {
      counts.set(d.category, (counts.get(d.category) || 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [activeRoom]);

  const filteredDevices = useMemo(() => {
    if (!activeRoom) return [];
    const q = roomSearch.trim().toLowerCase();
    return activeRoom.devices
      .filter((d) => {
        if (categoryFilter !== 'all' && d.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          d.alias.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.type.toLowerCase().includes(q) ||
          d.statusLabel.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Active / errors first, then alphabetical
        const prio = (d: FhemDevice) =>
          d.statusTone === 'error' ? 0 : d.statusTone === 'active' ? 1 : 2;
        if (prio(a) !== prio(b)) return prio(a) - prio(b);
        return a.alias.localeCompare(b.alias, 'de');
      });
  }, [activeRoom, categoryFilter, roomSearch]);

  const handleRoomLights = (state: 'on' | 'off') => {
    if (!activeRoom) return;
    const lights = activeRoom.devices.filter((d) => d.category === 'light' && d.isSwitchable);
    for (const light of lights) {
      onCommand(`set ${light.name} ${state}`);
    }
  };

  const handleRoomShutters = (pct: number) => {
    if (!activeRoom) return;
    const shutters = activeRoom.devices.filter((d) => d.isShutter);
    for (const shutter of shutters) {
      onCommand(`set ${shutter.name} pct ${pct}`);
    }
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Räume & Geräteübersicht
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {rooms.length} Räume · {devices.length} FHEM-Geräte strukturiert nach Raum
          </p>
        </div>

        <label className="flex min-h-[40px] cursor-pointer items-center gap-2 rounded-xl border theme-surface px-3 text-xs font-medium text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={includeTagRooms}
            onChange={(e) => setIncludeTagRooms(e.target.checked)}
            className="h-4 w-4 rounded accent-[var(--accent-primary)]"
          />
          <span>Auch Funktionsräume (ZigBee, Klima, Szenen)</span>
        </label>
      </div>

      {/* Main Split Layout: Room Directory + Active Room Devices */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: All Rooms List */}
        <section
          aria-label="Raumliste"
          className="lg:col-span-4 rounded-3xl border theme-surface overflow-hidden"
        >
          <div className="flex items-center justify-between border-b theme-border px-4 py-3">
            <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Alle Räume ({rooms.length})
            </h2>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">Auswählen</span>
          </div>

          <div className="flex gap-2 overflow-x-auto p-2.5 lg:flex-col lg:overflow-visible lg:max-h-[72vh] lg:overflow-y-auto">
            {rooms.map((room) => {
              const Icon = getRoomIcon(room.name);
              const isSelected = activeRoom?.name === room.name;
              return (
                <button
                  key={room.name}
                  type="button"
                  onClick={() => {
                    onSelectRoom(room.name);
                    setCategoryFilter('all');
                    setRoomSearch('');
                  }}
                  className={`flex min-w-[200px] lg:min-w-0 lg:w-full items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 text-left transition-colors ${
                    isSelected
                      ? 'border-[var(--accent-ring)] theme-tonal'
                      : 'border-transparent hover:bg-slate-100/80 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {showVisuals ? (
                      <div
                        className={`relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border ${
                          isSelected ? 'border-[var(--accent-ring)]' : 'theme-border'
                        }`}
                      >
                        <SmartVisualImage
                          src={resolveRoomImage(room.name, customMedia).src}
                          alt={`Vorschau ${room.name}`}
                          label={room.name}
                          className="h-full w-full"
                        />
                      </div>
                    ) : (
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          isSelected
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'theme-surface-alt text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {room.name}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>{room.devices.length} Geräte</span>
                        {room.avgTemp !== null && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{room.avgTemp.toFixed(1)} °C</span>
                          </>
                        )}
                        {room.lightsOn > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {room.lightsOn} an
                            </span>
                          </>
                        )}
                        {room.errors > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-red-600 dark:text-red-400">
                              {room.errors} Fehler
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="hidden lg:block h-4 w-4 shrink-0 opacity-50" />
                </button>
              );
            })}
          </div>
        </section>

        {/* Right Column: Selected Room Detail & Device List */}
        {activeRoom && (
          <section aria-label={`Geräte in ${activeRoom.name}`} className="lg:col-span-8 space-y-4">
            {/* Room Telemetry & Quick Room Actions */}
            <div className="rounded-3xl border theme-surface overflow-hidden">
              {showVisuals && (
                <div className="relative h-40 sm:h-48 w-full">
                  <SmartVisualImage
                    src={resolveRoomImage(activeRoom.name, customMedia).src}
                    alt={`Raumansicht ${activeRoom.name}`}
                    label={activeRoom.name}
                    className="h-full w-full"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/15" />

                  <button
                    type="button"
                    onClick={() =>
                      onOpenMediaPicker({kind: 'room', key: activeRoom.name, label: activeRoom.name})
                    }
                    className="absolute top-3.5 right-3.5 flex min-h-[38px] items-center gap-1.5 rounded-xl bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur-xs transition-colors hover:bg-black/75"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    <span>Bild ändern</span>
                  </button>

                  <div className="absolute bottom-4 left-4 right-4 sm:left-5 sm:right-5 flex flex-wrap items-end justify-between gap-3 text-white">
                    <div>
                      <h2 className="font-display text-xl sm:text-2xl font-bold drop-shadow-xs">
                        {activeRoom.name}
                      </h2>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-white/90 tabular-nums">
                        <span>{activeRoom.devices.length} Geräte</span>
                        {activeRoom.avgTemp !== null && (
                          <span className="flex items-center gap-1 font-semibold">
                            <Thermometer className="h-3.5 w-3.5" />
                            {activeRoom.avgTemp.toFixed(1)} °C
                          </span>
                        )}
                        {activeRoom.avgHumidity !== null && (
                          <span>{Math.round(activeRoom.avgHumidity)}% rF</span>
                        )}
                        {activeRoom.totalPower > 0 && (
                          <span className="flex items-center gap-1">
                            <Zap className="h-3.5 w-3.5" />
                            {activeRoom.totalPower.toFixed(0)} W
                          </span>
                        )}
                        {activeRoom.openContacts > 0 && (
                          <span className="font-semibold text-amber-300">
                            {activeRoom.openContacts} Fenster/Tür offen
                          </span>
                        )}
                        {activeRoom.errors > 0 && (
                          <span className="flex items-center gap-1 font-semibold text-red-300">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {activeRoom.errors} Störung
                          </span>
                        )}
                      </div>
                    </div>

                    {/* View Mode Toggle: List vs Cards */}
                    <div className="inline-flex rounded-xl bg-black/50 p-0.5 backdrop-blur-xs border border-white/15">
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                          viewMode === 'list'
                            ? 'bg-white text-slate-900'
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        <List className="h-3.5 w-3.5" />
                        Liste
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                          viewMode === 'grid'
                            ? 'bg-white text-slate-900'
                            : 'text-white/80 hover:text-white'
                        }`}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        Kacheln
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="p-4 sm:p-5 space-y-4">
                {!showVisuals && (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const RoomIcon = getRoomIcon(activeRoom.name);
                        return (
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl theme-tonal">
                            <RoomIcon className="h-6 w-6" />
                          </div>
                        );
                      })()}
                      <div>
                        <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100">
                          {activeRoom.name}
                        </h2>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          <span>{activeRoom.devices.length} Geräte</span>
                          {activeRoom.avgTemp !== null && (
                            <span className="flex items-center gap-1">
                              <Thermometer className="h-3.5 w-3.5" />
                              {activeRoom.avgTemp.toFixed(1)} °C
                            </span>
                          )}
                          {activeRoom.avgHumidity !== null && (
                            <span>{Math.round(activeRoom.avgHumidity)}% rF</span>
                          )}
                          {activeRoom.totalPower > 0 && (
                            <span className="flex items-center gap-1">
                              <Zap className="h-3.5 w-3.5" />
                              {activeRoom.totalPower.toFixed(0)} W
                            </span>
                          )}
                          {activeRoom.openContacts > 0 && (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {activeRoom.openContacts} Fenster/Tür offen
                            </span>
                          )}
                          {activeRoom.errors > 0 && (
                            <span className="flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              {activeRoom.errors} Störung
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* View Mode Toggle: List vs Cards */}
                    <div className="inline-flex rounded-xl border theme-border bg-[var(--m3-canvas)] p-0.5">
                      <button
                        type="button"
                        onClick={() => setViewMode('list')}
                        className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                          viewMode === 'list'
                            ? 'theme-tonal'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        <List className="h-3.5 w-3.5" />
                        Liste
                      </button>
                      <button
                        type="button"
                        onClick={() => setViewMode('grid')}
                        className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors ${
                          viewMode === 'grid'
                            ? 'theme-tonal'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        <LayoutGrid className="h-3.5 w-3.5" />
                        Kacheln
                      </button>
                    </div>
                  </div>
                )}

              {/* Room-Wide Quick Controls */}
              {(activeRoom.lightsTotal > 0 || activeRoom.shuttersTotal > 0) && (
                <div className="flex flex-wrap items-center gap-2 border-t theme-border pt-3">
                  {activeRoom.lightsTotal > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRoomLights('on')}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-xl theme-tonal px-3 text-xs font-semibold hover:opacity-90"
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                        Alle Lichter an ({activeRoom.lightsTotal})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRoomLights('off')}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-xl theme-surface-alt px-3 text-xs font-semibold text-slate-700 hover:opacity-85 dark:text-slate-200"
                      >
                        <LightbulbOff className="h-3.5 w-3.5" />
                        Alle Lichter aus
                      </button>
                    </>
                  )}
                  {activeRoom.shuttersTotal > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleRoomShutters(100)}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-xl theme-surface-alt px-3 text-xs font-semibold text-slate-700 hover:opacity-85 dark:text-slate-200"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                        Rollläden auf
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRoomShutters(0)}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-xl theme-surface-alt px-3 text-xs font-semibold text-slate-700 hover:opacity-85 dark:text-slate-200"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                        Rollläden zu
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* Search & Category Filter within Room */}
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={roomSearch}
                    onChange={(e) => setRoomSearch(e.target.value)}
                    placeholder={`In ${activeRoom.name} suchen...`}
                    className="min-h-[44px] w-full rounded-xl border theme-border bg-white pl-10 pr-4 text-sm text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                  />
                </div>
                {activeRoomCategories.length > 1 && (
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value as DeviceCategory | 'all')}
                    aria-label="Kategorie im Raum filtern"
                    className="min-h-[44px] rounded-xl border theme-border bg-white px-3 text-xs font-medium text-slate-800 dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                  >
                    <option value="all">Alle Typen ({activeRoom.devices.length})</option>
                    {activeRoomCategories.map(([cat, count]) => (
                      <option key={cat} value={cat}>
                        {CATEGORY_LABELS[cat]} ({count})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              </div>
            </div>

            {/* Devices List OR Tile Grid */}
            {filteredDevices.length === 0 ? (
              <div className="rounded-2xl border border-dashed theme-surface p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                Keine Geräte für diesen Filter in „{activeRoom.name}“ gefunden.
              </div>
            ) : viewMode === 'list' ? (
              <div className="rounded-3xl border theme-surface overflow-hidden divide-y divide-slate-200/70 dark:divide-white/[0.06]">
                {filteredDevices.map((dev) => {
                  const isActive = dev.statusTone === 'active';
                  const isError = dev.statusTone === 'error';
                  const isWarning = dev.statusTone === 'warning';
                  const isFav = favorites.includes(dev.name);

                  const toneClass = isError
                    ? 'text-red-600 dark:text-red-400'
                    : isWarning
                      ? 'text-amber-600 dark:text-amber-400'
                      : isActive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-500 dark:text-slate-400';

                  const dotClass = isError
                    ? 'bg-red-500'
                    : isWarning
                      ? 'bg-amber-500'
                      : isActive
                        ? 'bg-emerald-500'
                        : 'bg-slate-400 dark:bg-slate-600';

                  return (
                    <div
                      key={dev.name}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/90 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      <button
                        type="button"
                        onClick={() => onOpenDetail(dev)}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
                      >
                        {showVisuals && resolveDeviceImage(dev, customMedia).src ? (
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-xl border theme-border">
                            <img
                              src={resolveDeviceImage(dev, customMedia).src!}
                              alt={dev.alias}
                              loading="lazy"
                              referrerPolicy="no-referrer"
                              className="h-full w-full object-cover"
                            />
                          </div>
                        ) : (
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {dev.alias}
                            </span>
                            <span className="hidden sm:inline truncate font-mono text-[11px] text-slate-400">
                              {dev.name}
                            </span>
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                            <span className={`font-medium ${toneClass}`}>{dev.statusLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span>{dev.type}</span>
                            {dev.temperature !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{dev.temperature.toFixed(1)} °C</span>
                              </>
                            )}
                            {dev.power !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>{dev.power.toFixed(1)} W</span>
                              </>
                            )}
                            {showZigbeeMetrics && dev.battery !== undefined && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className={dev.battery <= 20 ? 'font-semibold text-amber-600 dark:text-amber-400' : ''}>
                                  {dev.battery}% Bat
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>

                      {/* Inline Quick Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {dev.isShutter && (
                          <div className="hidden sm:flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onCommand(`set ${dev.name} up`)}
                              aria-label={`${dev.alias} hochfahren`}
                              className="flex h-9 w-9 items-center justify-center rounded-xl theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-200"
                            >
                              <ArrowUp className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onCommand(`set ${dev.name} down`)}
                              aria-label={`${dev.alias} herunterfahren`}
                              className="flex h-9 w-9 items-center justify-center rounded-xl theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-200"
                            >
                              <ArrowDown className="h-4 w-4" />
                            </button>
                          </div>
                        )}

                        {dev.isSwitchable && (
                          <button
                            type="button"
                            onClick={() => onCommand(`set ${dev.name} ${isActive ? 'off' : 'on'}`)}
                            aria-label={`${dev.alias} ${isActive ? 'ausschalten' : 'einschalten'}`}
                            className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                              isActive
                                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'theme-surface-alt text-slate-600 hover:opacity-85 dark:text-slate-300'
                            }`}
                          >
                            <Power className="h-4.5 w-4.5" />
                          </button>
                        )}

                        {!dev.isSwitchable && !dev.isShutter && (
                          <span className="hidden sm:flex h-9 w-9 items-center justify-center text-slate-400">
                            {dev.category === 'climate' ? (
                              <Thermometer className="h-4 w-4" />
                            ) : dev.category === 'switch' ? (
                              <Plug className="h-4 w-4" />
                            ) : dev.category === 'shutter' ? (
                              <Blinds className="h-4 w-4" />
                            ) : (
                              <Cpu className="h-4 w-4" />
                            )}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => onToggleFavorite(dev.name)}
                          aria-label={isFav ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.06]"
                        >
                          <Star className={`h-4 w-4 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredDevices.map((dev) => (
                  <DeviceControlCard
                    key={dev.name}
                    device={dev}
                    isFavorite={favorites.includes(dev.name)}
                    showZigbeeMetrics={showZigbeeMetrics}
                    deviceImage={showVisuals ? resolveDeviceImage(dev, customMedia).src : null}
                    onOpenDetail={onOpenDetail}
                    onCommand={onCommand}
                    onToggleFavorite={onToggleFavorite}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
