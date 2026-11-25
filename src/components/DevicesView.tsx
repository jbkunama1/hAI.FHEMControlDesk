import React, {useEffect, useMemo, useState} from 'react';
import {ChevronDown, ChevronRight, Plus, Search, X} from 'lucide-react';
import type {CustomMediaStore, DeviceCategory, FhemDevice} from '../types/fhem';
import {resolveDeviceImage} from '../lib/roomVisuals';
import {DeviceControlCard} from './DeviceControlCard';

type GroupBy = 'room' | 'type';
type FilterMode = 'all' | 'active' | 'zigbee' | 'error' | 'favorites';

interface DevicesViewProps {
  devices: FhemDevice[];
  favorites: string[];
  showZigbeeMetrics: boolean;
  showVisuals: boolean;
  customMedia: CustomMediaStore;
  initialRoomFilter?: string | null;
  initialFilterMode?: FilterMode;
  onClearInitialFilters: () => void;
  onOpenDetail: (device: FhemDevice) => void;
  onCommand: (cmd: string) => void;
  onToggleFavorite: (deviceName: string) => void;
  onOpenDefineModal: () => void;
}

const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  light: 'Beleuchtung',
  shutter: 'Rollläden & Beschattung',
  climate: 'Heizung & Klima',
  switch: 'Steckdosen & Schalter',
  sensor: 'Sensoren & Kontakte',
  scene: 'Szenen & Strukturen',
  automation: 'Automatisierungen (at / DOIF / notify)',
  system: 'System & Bridges',
};

const CATEGORY_ORDER: DeviceCategory[] = [
  'light',
  'shutter',
  'climate',
  'switch',
  'sensor',
  'scene',
  'automation',
  'system',
];

export const DevicesView: React.FC<DevicesViewProps> = ({
  devices,
  favorites,
  showZigbeeMetrics,
  showVisuals,
  customMedia,
  initialRoomFilter,
  initialFilterMode,
  onClearInitialFilters,
  onOpenDetail,
  onCommand,
  onToggleFavorite,
  onOpenDefineModal,
}) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('room');
  const [filterMode, setFilterMode] = useState<FilterMode>(initialFilterMode || 'all');
  const [selectedGroup, setSelectedGroup] = useState<string>(initialRoomFilter || 'ALL');
  const [search, setSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialRoomFilter) {
      setGroupBy('room');
      setSelectedGroup(initialRoomFilter);
      setFilterMode('all');
      onClearInitialFilters();
    } else if (initialFilterMode) {
      setFilterMode(initialFilterMode);
      setSelectedGroup('ALL');
      onClearInitialFilters();
    }
  }, [initialRoomFilter, initialFilterMode, onClearInitialFilters]);

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return devices.filter((d) => {
      if (filterMode === 'active' && d.statusTone !== 'active') return false;
      if (filterMode === 'zigbee' && !d.isZigbee) return false;
      if (filterMode === 'error' && d.statusTone !== 'error' && d.statusTone !== 'warning') return false;
      if (filterMode === 'favorites' && !favoriteSet.has(d.name)) return false;

      if (q) {
        const hit =
          d.alias.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.primaryRoom.toLowerCase().includes(q) ||
          d.type.toLowerCase().includes(q) ||
          d.state.toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [devices, filterMode, search, favoriteSet]);

  const grouped = useMemo(() => {
    const map = new Map<string, FhemDevice[]>();
    for (const d of filteredDevices) {
      const key = groupBy === 'room' ? d.primaryRoom : CATEGORY_LABELS[d.category];
      const bucket = map.get(key) || [];
      bucket.push(d);
      map.set(key, bucket);
    }

    const entries = Array.from(map.entries());
    if (groupBy === 'type') {
      const orderLabels = CATEGORY_ORDER.map((c) => CATEGORY_LABELS[c]);
      entries.sort((a, b) => orderLabels.indexOf(a[0]) - orderLabels.indexOf(b[0]));
    } else {
      entries.sort((a, b) => a[0].localeCompare(b[0], 'de'));
    }
    return entries;
  }, [filteredDevices, groupBy]);

  const availableGroupKeys = useMemo(() => grouped.map(([k]) => k), [grouped]);

  const visibleGroups = useMemo(() => {
    if (selectedGroup === 'ALL') return grouped;
    return grouped.filter(([k]) => k === selectedGroup);
  }, [grouped, selectedGroup]);

  const toggleCollapse = (groupKey: string) => {
    setCollapsedGroups((prev) => ({...prev, [groupKey]: !prev[groupKey]}));
  };

  return (
    <div className="space-y-4 pb-8">
      {/* Top Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Geräteübersicht
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {filteredDevices.length} von {devices.length} Geräten · {devices.filter((d) => d.isZigbee).length} ZigBee
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Group By Segmented Control */}
          <div className="inline-flex rounded-xl theme-surface-alt p-1 border theme-border">
            <button
              type="button"
              onClick={() => {
                setGroupBy('room');
                setSelectedGroup('ALL');
              }}
              className={`min-h-[38px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                groupBy === 'room'
                  ? 'bg-[var(--m3-surface)] text-slate-900 shadow-xs dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Nach Räumen
            </button>
            <button
              type="button"
              onClick={() => {
                setGroupBy('type');
                setSelectedGroup('ALL');
              }}
              className={`min-h-[38px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                groupBy === 'type'
                  ? 'bg-[var(--m3-surface)] text-slate-900 shadow-xs dark:text-slate-100'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Nach Gerätetyp
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenDefineModal}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl theme-btn-primary px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Device definieren</span>
            <span className="sm:hidden">Neu</span>
          </button>
        </div>
      </div>

      {/* Inline Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Liste filtern (Name, Alias, Raum, Status)..."
            className="min-h-[44px] w-full rounded-xl border theme-surface pl-10 pr-10 text-sm text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:text-slate-100"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Filter leeren"
              className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
          {(
            [
              {id: 'all', label: 'Alle'},
              {id: 'active', label: 'Aktiv / An'},
              {id: 'zigbee', label: 'ZigBee'},
              {id: 'error', label: 'Warnung / Fehler'},
              {id: 'favorites', label: 'Favoriten'},
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilterMode(f.id)}
              className={`min-h-[42px] rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                filterMode === f.id
                  ? 'theme-btn-primary'
                  : 'border theme-surface text-slate-700 hover:border-[var(--accent-ring)] dark:text-slate-300'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Room / Category Horizontal Selector */}
      {availableGroupKeys.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedGroup('ALL')}
            className={`min-h-[38px] rounded-xl px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              selectedGroup === 'ALL'
                ? 'theme-tonal font-semibold'
                : 'theme-surface border text-slate-600 hover:border-[var(--accent-ring)] dark:text-slate-300'
            }`}
          >
            Alle ({filteredDevices.length})
          </button>
          {grouped.map(([groupKey, items]) => (
            <button
              key={groupKey}
              type="button"
              onClick={() => setSelectedGroup(groupKey)}
              className={`min-h-[38px] rounded-xl px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                selectedGroup === groupKey
                  ? 'theme-tonal font-semibold'
                  : 'theme-surface border text-slate-600 hover:border-[var(--accent-ring)] dark:text-slate-300'
              }`}
            >
              {groupKey} ({items.length})
            </button>
          ))}
        </div>
      )}

      {/* Grouped Device Sections */}
      {visibleGroups.length === 0 ? (
        <div className="rounded-2xl border theme-surface p-10 text-center">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Keine Geräte entsprechen den aktuellen Filtern.
          </p>
          <button
            type="button"
            onClick={() => {
              setFilterMode('all');
              setSelectedGroup('ALL');
              setSearch('');
            }}
            className="mt-3 min-h-[44px] rounded-xl theme-surface-alt px-4 text-xs font-semibold text-slate-800 hover:opacity-85 dark:text-slate-200"
          >
            Filter zurücksetzen
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {visibleGroups.map(([groupKey, items]) => {
            const collapsed = Boolean(collapsedGroups[groupKey]) && selectedGroup === 'ALL';
            const activeCount = items.filter((d) => d.statusTone === 'active').length;
            const errorCount = items.filter((d) => d.statusTone === 'error').length;

            return (
              <section key={groupKey} className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => toggleCollapse(groupKey)}
                  className="flex min-h-[44px] w-full items-center justify-between rounded-xl px-1 text-left"
                >
                  <div className="flex items-center gap-2">
                    {collapsed ? (
                      <ChevronRight className="h-4.5 w-4.5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4.5 w-4.5 text-slate-400" />
                    )}
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                      {groupKey}
                    </h2>
                    <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      · {items.length} Geräte
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    {activeCount > 0 && (
                      <span className="font-medium text-emerald-600 dark:text-emerald-400">
                        {activeCount} aktiv
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="font-semibold text-red-600 dark:text-red-400">
                        {errorCount} Fehler
                      </span>
                    )}
                  </div>
                </button>

                {!collapsed && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {items.map((dev) => (
                      <DeviceControlCard
                        key={dev.name}
                        device={dev}
                        isFavorite={favoriteSet.has(dev.name)}
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
            );
          })}
        </div>
      )}
    </div>
  );
};
