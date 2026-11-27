import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Database,
  Download,
  Droplets,
  ExternalLink,
  FileText,
  GitCompare,
  Info,
  Layers,
  LineChart as LineChartIcon,
  Loader2,
  Minus,
  Radio,
  RefreshCw,
  Search,
  Thermometer,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type {ChartTarget, FhemConnectionConfig, FhemDevice} from '../types/fhem';
import {executeFhemCommand} from '../lib/fhemClient';
import {
  buildSensorHistorySeries,
  clearHistoryCache,
  computeSeriesStats,
  discoverFhemLogDevices,
  extractChartableReadings,
  fetchFhemSensorHistory,
  formatReadingMetric,
  getReadingMeta,
  scoreFileLogMatch,
  type ChartTimeframe,
  type FhemLogDeviceType,
  type HistoryFetchResult,
  type HistorySourcePreference,
  type SensorReadingOption,
} from '../lib/sensorHistory';

interface ChartsViewProps {
  devices: FhemDevice[];
  config: FhemConnectionConfig;
  initialTarget?: ChartTarget | null;
  onClearInitialTarget?: () => void;
  onOpenDetail: (device: FhemDevice) => void;
}

type MetricFilter = 'all' | 'climate' | 'energy' | 'zigbee';
type ChartKind = 'area' | 'line' | 'bar';

interface ChartableDeviceEntry {
  device: FhemDevice;
  readings: SensorReadingOption[];
  hasClimate: boolean;
  hasEnergy: boolean;
  hasTempAndHumidity: boolean;
}

const TIMEFRAMES: Array<{id: ChartTimeframe; label: string}> = [
  {id: '6h', label: '6 Std.'},
  {id: '24h', label: '24 Std.'},
  {id: '7d', label: '7 Tage'},
  {id: '30d', label: '30 Tage'},
];

const METRIC_FILTERS: Array<{id: MetricFilter; label: string}> = [
  {id: 'all', label: 'Alle Sensoren'},
  {id: 'climate', label: 'Klima'},
  {id: 'energy', label: 'Energie'},
  {id: 'zigbee', label: 'ZigBee'},
];

export const ChartsView: React.FC<ChartsViewProps> = ({
  devices,
  config,
  initialTarget,
  onClearInitialTarget,
  onOpenDetail,
}) => {
  const [search, setSearch] = useState('');
  const [metricFilter, setMetricFilter] = useState<MetricFilter>('all');
  const [selectedDeviceName, setSelectedDeviceName] = useState<string>('');
  const [selectedReadingKey, setSelectedReadingKey] = useState<string>('');
  const [timeframe, setTimeframe] = useState<ChartTimeframe>('24h');
  const [chartKind, setChartKind] = useState<ChartKind>('area');
  const [dualClimateMode, setDualClimateMode] = useState(false);
  const [compareDeviceName, setCompareDeviceName] = useState<string>('');

  // FHEM DbLog / FileLog history state
  const [sourcePreference, setSourcePreference] = useState<HistorySourcePreference>('auto');
  const [manualLogNameDraft, setManualLogNameDraft] = useState('');
  const [manualLogTypeDraft, setManualLogTypeDraft] = useState<FhemLogDeviceType>('DbLog');
  const [appliedManualLog, setAppliedManualLog] = useState<{name: string; type: FhemLogDeviceType} | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyResult, setHistoryResult] = useState<HistoryFetchResult | null>(null);

  const logDevices = useMemo(() => discoverFhemLogDevices(devices), [devices]);
  const logDevicesSignature = useMemo(
    () => logDevices.map((d) => `${d.name}:${d.type}:${d.regexp}`).join('|'),
    [logDevices]
  );

  const chartableDevices = useMemo<ChartableDeviceEntry[]>(() => {
    const entries: ChartableDeviceEntry[] = [];
    for (const device of devices) {
      const readings = extractChartableReadings(device);
      if (readings.length === 0) continue;
      const keys = new Set(readings.map((r) => r.key));
      const hasTemp = keys.has('temperature') || keys.has('measured-temp');
      const hasHum = keys.has('humidity');
      entries.push({
        device,
        readings,
        hasClimate: readings.some((r) => r.category === 'climate'),
        hasEnergy: readings.some((r) => r.category === 'energy'),
        hasTempAndHumidity: hasTemp && hasHum,
      });
    }

    // Prioritize dedicated climate/energy sensors at the top for immediate usefulness
    entries.sort((a, b) => {
      const score = (e: ChartableDeviceEntry) => {
        if (e.hasTempAndHumidity) return 0;
        if (e.hasClimate) return 1;
        if (e.hasEnergy) return 2;
        return 3;
      };
      if (score(a) !== score(b)) return score(a) - score(b);
      return a.device.alias.localeCompare(b.device.alias, 'de');
    });

    return entries;
  }, [devices]);

  // Apply deep-link target coming from DeviceDetailSheet
  useEffect(() => {
    if (!initialTarget) return;
    const match = chartableDevices.find((e) => e.device.name === initialTarget.deviceName);
    if (match) {
      setSelectedDeviceName(match.device.name);
      setMetricFilter('all');
      setSearch('');
      setCompareDeviceName('');

      const targetReading =
        initialTarget.readingKey && match.readings.some((r) => r.key === initialTarget.readingKey)
          ? initialTarget.readingKey
          : match.readings[0]?.key || '';
      setSelectedReadingKey(targetReading);
      setDualClimateMode(
        match.hasTempAndHumidity &&
          (!initialTarget.readingKey || initialTarget.readingKey === 'temperature')
      );
    }
    onClearInitialTarget?.();
  }, [initialTarget, chartableDevices, onClearInitialTarget]);

  // Ensure a valid default selection on first mount
  useEffect(() => {
    if (chartableDevices.length === 0) return;
    const existing = chartableDevices.find((e) => e.device.name === selectedDeviceName);
    if (!existing) {
      const first = chartableDevices[0];
      setSelectedDeviceName(first.device.name);
      setSelectedReadingKey(first.readings[0]?.key || '');
      setDualClimateMode(first.hasTempAndHumidity);
    } else if (!existing.readings.some((r) => r.key === selectedReadingKey)) {
      setSelectedReadingKey(existing.readings[0]?.key || '');
    }
  }, [chartableDevices, selectedDeviceName, selectedReadingKey]);

  const filteredDevices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return chartableDevices.filter((entry) => {
      if (metricFilter === 'climate' && !entry.hasClimate) return false;
      if (metricFilter === 'energy' && !entry.hasEnergy) return false;
      if (metricFilter === 'zigbee' && !entry.device.isZigbee) return false;
      if (!q) return true;
      return (
        entry.device.alias.toLowerCase().includes(q) ||
        entry.device.name.toLowerCase().includes(q) ||
        entry.device.primaryRoom.toLowerCase().includes(q) ||
        entry.readings.some(
          (r) => r.key.toLowerCase().includes(q) || r.label.toLowerCase().includes(q)
        )
      );
    });
  }, [chartableDevices, metricFilter, search]);

  const activeEntry = useMemo(
    () =>
      chartableDevices.find((e) => e.device.name === selectedDeviceName) ||
      chartableDevices[0] ||
      null,
    [chartableDevices, selectedDeviceName]
  );

  const activeReading = useMemo(() => {
    if (!activeEntry) return null;
    return (
      activeEntry.readings.find((r) => r.key === selectedReadingKey) ||
      activeEntry.readings[0] ||
      null
    );
  }, [activeEntry, selectedReadingKey]);

  const canUseDualClimate = Boolean(
    activeEntry?.hasTempAndHumidity &&
      (activeReading?.key === 'temperature' || activeReading?.key === 'measured-temp')
  );

  const effectiveDualClimate = canUseDualClimate && dualClimateMode && !compareDeviceName;

  // Potential comparison sensors that share the same reading key
  const comparableDevices = useMemo(() => {
    if (!activeEntry || !activeReading) return [];
    return chartableDevices.filter(
      (entry) =>
        entry.device.name !== activeEntry.device.name &&
        entry.readings.some((r) => r.key === activeReading.key)
    );
  }, [chartableDevices, activeEntry, activeReading]);

  const compareDevice = useMemo(() => {
    if (!compareDeviceName || !activeReading) return null;
    const match = comparableDevices.find((e) => e.device.name === compareDeviceName);
    return match ? match.device : null;
  }, [comparableDevices, compareDeviceName, activeReading]);

  // Keep latest object references so Longpoll ticks on unrelated devices don't re-trigger FHEM history queries
  const activeDeviceRef = useRef<FhemDevice | null>(null);
  activeDeviceRef.current = activeEntry?.device || null;
  const compareDeviceRef = useRef<FhemDevice | null>(null);
  compareDeviceRef.current = compareDevice;
  const logDevicesRef = useRef(logDevices);
  logDevicesRef.current = logDevices;
  const configRef = useRef(config);
  configRef.current = config;

  const activeDeviceKey = activeEntry?.device.name || '';
  const activeReadingKey = activeReading?.key || '';
  const compareDeviceKey = compareDevice?.name || '';

  // Reset device-specific source selection if that log device disappeared
  useEffect(() => {
    if (sourcePreference.startsWith('device:')) {
      const targetName = sourcePreference.slice('device:'.length);
      if (!logDevices.some((d) => d.name === targetName)) {
        setSourcePreference('auto');
      }
    }
  }, [logDevices, sourcePreference]);

  // Fetch real historical series from FHEM DbLog / FileLog (with 60s TTL cache & clean fallback)
  useEffect(() => {
    const dev = activeDeviceRef.current;
    if (!dev || !activeReadingKey) {
      setHistoryResult(null);
      setLoadingHistory(false);
      return;
    }

    let cancelled = false;
    setLoadingHistory(true);

    void fetchFhemSensorHistory({
      config: configRef.current,
      logDevices: logDevicesRef.current,
      device: dev,
      readingKey: activeReadingKey,
      timeframe,
      secondaryReadingKey: effectiveDualClimate ? 'humidity' : null,
      compareDevice: compareDeviceRef.current,
      sourcePreference,
      manualLogDevice: sourcePreference === 'manual' ? appliedManualLog : null,
      executeCmd: executeFhemCommand,
    })
      .then((res) => {
        if (!cancelled) {
          setHistoryResult(res);
          setLoadingHistory(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          const fallbackPts = buildSensorHistorySeries({
            device: dev,
            readingKey: activeReadingKey,
            timeframe,
            secondaryReadingKey: effectiveDualClimate ? 'humidity' : null,
            compareDevice: compareDeviceRef.current,
          });
          setHistoryResult({
            points: fallbackPts,
            stats: computeSeriesStats(fallbackPts),
            source: 'simulated',
            rawPointCount: fallbackPts.length,
            downsampled: false,
            notice: 'FHEM-Verlaufsabfrage fehlgeschlagen — Vorschau aktiv.',
            fetchedAt: Date.now(),
          });
          setLoadingHistory(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeDeviceKey,
    activeReadingKey,
    timeframe,
    effectiveDualClimate,
    compareDeviceKey,
    sourcePreference,
    appliedManualLog,
    logDevicesSignature,
    reloadNonce,
    config.mode,
    config.host,
    config.port,
    config.protocol,
    config.transport,
  ]);

  const fallbackSeriesData = useMemo(() => {
    if (historyResult || !activeEntry || !activeReading) return [];
    return buildSensorHistorySeries({
      device: activeEntry.device,
      readingKey: activeReading.key,
      timeframe,
      secondaryReadingKey: effectiveDualClimate ? 'humidity' : null,
      compareDevice,
    });
  }, [historyResult, activeEntry, activeReading, timeframe, effectiveDualClimate, compareDevice]);

  const seriesData = historyResult ? historyResult.points : fallbackSeriesData;
  const stats = useMemo(
    () => (historyResult ? historyResult.stats : computeSeriesStats(seriesData)),
    [historyResult, seriesData]
  );

  const handleForceReloadHistory = () => {
    clearHistoryCache();
    setReloadNonce((n) => n + 1);
  };

  const handleApplyManualLog = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = manualLogNameDraft.trim();
    if (!cleaned) return;
    clearHistoryCache();
    setAppliedManualLog({name: cleaned, type: manualLogTypeDraft});
    setReloadNonce((n) => n + 1);
  };

  const humidityMeta = getReadingMeta('humidity');
  const desiredTempValue =
    activeEntry && (activeReading?.key === 'temperature' || activeReading?.key === 'measured-temp')
      ? activeEntry.device.desiredTemp
      : undefined;

  const handleSelectSensor = (entry: ChartableDeviceEntry) => {
    setSelectedDeviceName(entry.device.name);
    setCompareDeviceName('');
    // Preserve same reading key if target sensor also has it, otherwise take primary reading
    const keepKey = entry.readings.some((r) => r.key === selectedReadingKey)
      ? selectedReadingKey
      : entry.readings[0]?.key || '';
    setSelectedReadingKey(keepKey);
    if (!entry.hasTempAndHumidity) {
      setDualClimateMode(false);
    }
  };

  const handleExportCsv = () => {
    if (!activeEntry || !activeReading || seriesData.length === 0) return;
    const headers = [
      'Zeitstempel',
      `${activeEntry.device.name}_${activeReading.key} (${activeReading.unit || 'Wert'})`,
    ];
    if (effectiveDualClimate) headers.push(`${activeEntry.device.name}_humidity (% rF)`);
    if (compareDevice) headers.push(`${compareDevice.name}_${activeReading.key} (${activeReading.unit || 'Wert'})`);

    const rows = seriesData.map((pt) => {
      const cols = [pt.fullTime, String(pt.value)];
      if (effectiveDualClimate) cols.push(pt.secondaryValue !== undefined ? String(pt.secondaryValue) : '');
      if (compareDevice) cols.push(pt.compareValue !== undefined ? String(pt.compareValue) : '');
      return cols.join(';');
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeEntry.device.name}_${activeReading.key}_${timeframe}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getCategoryIcon = (category: SensorReadingOption['category']) => {
    if (category === 'climate') return Thermometer;
    if (category === 'energy') return Zap;
    if (category === 'zigbee') return Radio;
    return Activity;
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Diagramme & Sensorverlauf
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {chartableDevices.length} Sensoren & Geräte ·{' '}
            {logDevices.length > 0
              ? `${logDevices.filter((d) => d.type === 'DbLog').length} DbLog & ${logDevices.filter((d) => d.type === 'FileLog').length} FileLog erkannt`
              : 'Kein DbLog/FileLog erkannt (Vorschau-Modus)'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Chart Type Switcher */}
          <div className="inline-flex rounded-xl border theme-border bg-[var(--m3-surface)] p-0.5">
            {(
              [
                {id: 'area', label: 'Fläche', icon: TrendingUp},
                {id: 'line', label: 'Linie', icon: LineChartIcon},
                {id: 'bar', label: 'Balken', icon: BarChart3},
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setChartKind(opt.id)}
                  className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    chartKind === opt.id
                      ? 'theme-tonal'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={seriesData.length === 0}
            title="Zeitreihe als CSV exportieren"
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border theme-surface px-3 text-xs font-semibold text-slate-700 hover:border-[var(--accent-ring)] disabled:opacity-40 dark:text-slate-200 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">CSV</span>
          </button>
        </div>
      </div>

      {/* Main Split Workspace: Sensor Directory (Left) + Recharts Stage (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Sensor Selector */}
        <section
          aria-label="Sensor-Auswahl"
          className="lg:col-span-4 rounded-3xl border theme-surface overflow-hidden"
        >
          <div className="border-b theme-border p-3.5 space-y-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Sensor, Raum oder Reading..."
                className="min-h-[42px] w-full rounded-xl border theme-border bg-white pl-9 pr-8 text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Suche leeren"
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
              {METRIC_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMetricFilter(f.id)}
                  className={`min-h-[34px] rounded-xl px-2.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    metricFilter === f.id
                      ? 'theme-btn-primary'
                      : 'theme-surface-alt text-slate-600 hover:opacity-90 dark:text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {filteredDevices.length === 0 ? (
            <div className="p-6 text-center space-y-2.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Keine passenden Sensoren gefunden.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setMetricFilter('all');
                }}
                className="min-h-[38px] rounded-xl theme-surface-alt px-3.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
              >
                Filter zurücksetzen
              </button>
            </div>
          ) : (
            <div className="flex gap-2 overflow-x-auto p-2.5 lg:flex-col lg:overflow-visible lg:max-h-[68vh] lg:overflow-y-auto">
              {filteredDevices.map((entry) => {
                const isSelected = activeEntry?.device.name === entry.device.name;
                const primary = entry.readings[0];
                const secondary = entry.readings[1];
                const Icon = getCategoryIcon(primary.category);

                return (
                  <button
                    key={entry.device.name}
                    type="button"
                    onClick={() => handleSelectSensor(entry)}
                    className={`flex min-w-[230px] lg:min-w-0 lg:w-full items-center justify-between gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                      isSelected
                        ? 'border-[var(--accent-ring)] theme-tonal'
                        : 'border-transparent hover:bg-slate-100/80 dark:hover:bg-white/[0.05]'
                    }`}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isSelected
                            ? 'bg-[var(--accent-primary)] text-white'
                            : 'theme-surface-alt text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {entry.device.alias}
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">
                          {entry.device.primaryRoom} · {entry.readings.length} Readings
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 text-right font-mono tabular-nums">
                      <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {primary.formattedValue}
                      </div>
                      {secondary && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {secondary.formattedValue}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Right Column: Recharts Canvas & Metrics */}
        {activeEntry && activeReading ? (
          <section aria-label={`Verlauf für ${activeEntry.device.alias}`} className="lg:col-span-8 space-y-4">
            {/* Active Sensor Toolbar Card */}
            <div className="rounded-3xl border theme-surface p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <h2 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 truncate">
                      {activeEntry.device.alias}
                    </h2>
                    <span className="font-mono text-xs text-slate-400">{activeEntry.device.name}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{activeEntry.device.primaryRoom}</span>
                    <span aria-hidden="true">·</span>
                    <span>{activeEntry.device.type}</span>
                    {activeEntry.device.model && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{activeEntry.device.model}</span>
                      </>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onOpenDetail(activeEntry.device)}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl theme-surface-alt px-3 text-xs font-semibold text-slate-700 hover:opacity-85 dark:text-slate-200 whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Gerätedetails
                </button>
              </div>

              {/* Reading Selector & Timeframe Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t theme-border pt-3.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {activeEntry.readings.map((r) => {
                    const selected = activeReading.key === r.key;
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => {
                          setSelectedReadingKey(r.key);
                          setCompareDeviceName('');
                          if (r.key !== 'temperature' && r.key !== 'measured-temp') {
                            setDualClimateMode(false);
                          }
                        }}
                        className={`flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                          selected
                            ? 'theme-btn-primary'
                            : 'theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-300'
                        }`}
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{backgroundColor: selected ? '#FFFFFF' : r.color}}
                          aria-hidden="true"
                        />
                        <span>{r.label}</span>
                        <span className="font-mono text-[11px] opacity-85 tabular-nums">
                          {r.formattedValue}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Timeframe Segmented Selector */}
                <div className="inline-flex self-start rounded-xl border theme-border bg-[var(--m3-canvas)] p-0.5 shrink-0">
                  {TIMEFRAMES.map((tf) => (
                    <button
                      key={tf.id}
                      type="button"
                      onClick={() => setTimeframe(tf.id)}
                      className={`min-h-[36px] rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                        timeframe === tf.id
                          ? 'theme-tonal'
                          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                      }`}
                    >
                      {tf.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Optional Dual-Axis & Multi-Sensor Comparison Bar */}
              {(canUseDualClimate || comparableDevices.length > 0) && (
                <div className="flex flex-wrap items-center justify-between gap-2.5 border-t theme-border pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {canUseDualClimate && (
                      <button
                        type="button"
                        onClick={() => {
                          setCompareDeviceName('');
                          setDualClimateMode((v) => !v);
                        }}
                        className={`flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold transition-colors ${
                          effectiveDualClimate
                            ? 'border-sky-400/70 bg-sky-500/12 text-sky-700 dark:text-sky-300'
                            : 'theme-border text-slate-600 hover:border-[var(--accent-ring)] dark:text-slate-300'
                        }`}
                      >
                        <Layers className="h-3.5 w-3.5" />
                        <span>+ Luftfeuchtigkeit überlagern</span>
                      </button>
                    )}

                    {comparableDevices.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        <GitCompare className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <select
                          value={compareDeviceName}
                          onChange={(e) => {
                            const next = e.target.value;
                            setCompareDeviceName(next);
                            if (next) setDualClimateMode(false);
                          }}
                          aria-label="Mit anderem Sensor vergleichen"
                          className="min-h-[38px] rounded-xl border theme-border bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                        >
                          <option value="">Mit anderem Raum vergleichen…</option>
                          {comparableDevices.map((c) => (
                            <option key={c.device.name} value={c.device.name}>
                              {c.device.alias} ({c.device.primaryRoom})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {effectiveDualClimate && activeEntry.readings.find((r) => r.key === 'humidity') && (
                    <div className="flex items-center gap-1.5 text-xs text-sky-600 dark:text-sky-400 font-medium tabular-nums">
                      <Droplets className="h-3.5 w-3.5" />
                      <span>
                        Aktuell: {activeEntry.readings.find((r) => r.key === 'humidity')?.formattedValue}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* FHEM Log Source Bar (DbLog / FileLog Auto-Detection & Override) */}
              <div className="border-t theme-border pt-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      {historyResult?.source === 'filelog' ? (
                        <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      ) : (
                        <Database className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      )}
                      <select
                        value={sourcePreference}
                        onChange={(e) => {
                          const next = e.target.value as HistorySourcePreference;
                          setSourcePreference(next);
                        }}
                        aria-label="FHEM Verlaufsquelle wählen"
                        className="min-h-[36px] rounded-xl border theme-border bg-white px-2.5 text-xs font-medium text-slate-800 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                      >
                        <option value="auto">
                          Automatisch (DbLog → FileLog)
                        </option>
                        {logDevices.filter((d) => d.type === 'DbLog').length > 0 && (
                          <optgroup label="FHEM DbLog">
                            {logDevices
                              .filter((d) => d.type === 'DbLog')
                              .map((d) => (
                                <option key={d.name} value={`device:${d.name}`}>
                                  DbLog · {d.name}
                                </option>
                              ))}
                          </optgroup>
                        )}
                        {logDevices.filter((d) => d.type === 'FileLog').length > 0 && (
                          <optgroup label="FHEM FileLog">
                            {logDevices
                              .filter((d) => d.type === 'FileLog')
                              .map((d) => {
                                const matches = scoreFileLogMatch(d, activeEntry.device.name, activeReading.key) > 0;
                                return (
                                  <option key={d.name} value={`device:${d.name}`}>
                                    FileLog · {d.name}
                                    {matches ? ' ✓' : ''}
                                  </option>
                                );
                              })}
                          </optgroup>
                        )}
                        <option value="manual">Manuelles Log-Gerät…</option>
                        <option value="simulated">Lokale Vorschau (simuliert)</option>
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={handleForceReloadHistory}
                      disabled={loadingHistory}
                      title="Verlaufsdaten neu aus FHEM laden (Cache umgehen)"
                      className="flex min-h-[36px] items-center gap-1.5 rounded-xl border theme-border px-2.5 text-xs font-semibold text-slate-600 hover:border-[var(--accent-ring)] disabled:opacity-50 dark:text-slate-300"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
                      <span className="hidden sm:inline">Neu laden</span>
                    </button>
                  </div>

                  {/* Active Data Source Summary */}
                  <div
                    className="flex items-center gap-2 text-[11px] font-medium tabular-nums"
                    title={historyResult?.commandUsed ? `FHEM-Befehl: ${historyResult.commandUsed}` : undefined}
                  >
                    {loadingHistory ? (
                      <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Lade aus FHEM…
                      </span>
                    ) : historyResult?.source === 'dblog' || historyResult?.source === 'filelog' ? (
                      <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                        <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                        <span>
                          {historyResult.logDeviceType}: <strong className="font-mono">{historyResult.logDeviceName}</strong>
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {historyResult.rawPointCount.toLocaleString('de-DE')} Messpunkte
                          {historyResult.downsampled ? ` (${historyResult.points.length} verdichtet)` : ''}
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                        <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" aria-hidden="true" />
                        <span>Vorschau-Verlauf</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Manual Log Device Input Row */}
                {sourcePreference === 'manual' && (
                  <form
                    onSubmit={handleApplyManualLog}
                    className="flex flex-wrap items-center gap-2 rounded-2xl border theme-border bg-[var(--m3-canvas)] p-2.5"
                  >
                    <select
                      value={manualLogTypeDraft}
                      onChange={(e) => setManualLogTypeDraft(e.target.value as FhemLogDeviceType)}
                      aria-label="Log-Gerätetyp"
                      className="min-h-[36px] rounded-xl border theme-border bg-white px-2.5 text-xs font-semibold text-slate-800 dark:bg-[var(--m3-surface)] dark:text-slate-100"
                    >
                      <option value="DbLog">DbLog</option>
                      <option value="FileLog">FileLog</option>
                    </select>
                    <input
                      type="text"
                      value={manualLogNameDraft}
                      onChange={(e) => setManualLogNameDraft(e.target.value)}
                      placeholder="FHEM-Gerätename (z. B. logdb oder FileLog_Temp_WZ)"
                      className="min-h-[36px] flex-1 min-w-[180px] rounded-xl border theme-border bg-white px-3 font-mono text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-surface)] dark:text-slate-100"
                    />
                    <button
                      type="submit"
                      disabled={!manualLogNameDraft.trim() || loadingHistory}
                      className="min-h-[36px] rounded-xl theme-btn-primary px-3.5 text-xs font-semibold disabled:opacity-45"
                    >
                      Abfragen
                    </button>
                  </form>
                )}

                {/* Transparent Fallback Notice (only shown when falling back to preview) */}
                {!loadingHistory && historyResult?.notice && historyResult.source === 'simulated' && (
                  <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    <span>{historyResult.notice}</span>
                  </div>
                )}
              </div>
            </div>

            {/* KPI Summary Strip */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-2xl border theme-surface p-3.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Aktuell</div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatReadingMetric(stats.current, activeReading)}
                  </div>
                  <div className="mt-1 flex items-center gap-1 text-[11px] tabular-nums">
                    {Math.abs(stats.delta) < 0.05 ? (
                      <span className="flex items-center gap-0.5 text-slate-500 dark:text-slate-400">
                        <Minus className="h-3 w-3" /> Stabil
                      </span>
                    ) : stats.delta > 0 ? (
                      <span className="flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                        <ArrowUpRight className="h-3.5 w-3.5" />+
                        {formatReadingMetric(stats.delta, activeReading)}
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 font-medium text-sky-600 dark:text-sky-400">
                        <ArrowDownRight className="h-3.5 w-3.5" />
                        {formatReadingMetric(stats.delta, activeReading)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border theme-surface p-3.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Durchschnitt (Ø)
                  </div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {formatReadingMetric(stats.avg, activeReading)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                    Zeitraum {TIMEFRAMES.find((t) => t.id === timeframe)?.label}
                  </div>
                </div>

                <div className="rounded-2xl border theme-surface p-3.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Minimum</div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-sky-600 dark:text-sky-400">
                    {formatReadingMetric(stats.min, activeReading)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Tiefstwert</div>
                </div>

                <div className="rounded-2xl border theme-surface p-3.5">
                  <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Maximum</div>
                  <div className="mt-1 font-display text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {formatReadingMetric(stats.max, activeReading)}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Höchstwert</div>
                </div>
              </div>
            )}

            {/* Main Recharts Visualization Card */}
            <div className="rounded-3xl border theme-surface p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {activeReading.label}
                    {effectiveDualClimate ? ' & Luftfeuchtigkeit' : ''}
                    {compareDevice ? ` vs. ${compareDevice.alias}` : ''}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Reading: {activeReading.key}
                    {activeReading.timestamp ? ` · Letzter Messwert: ${activeReading.timestamp}` : ''}
                  </p>
                </div>
                {desiredTempValue !== undefined && (
                  <span className="text-[11px] font-mono font-medium text-red-500 dark:text-red-400 tabular-nums">
                    Sollwert-Linie: {desiredTempValue.toFixed(1)} °C
                  </span>
                )}
              </div>

              <div className={`relative h-[320px] sm:h-[360px] w-full transition-opacity ${loadingHistory ? 'opacity-60' : 'opacity-100'}`}>
                {loadingHistory && (
                  <div className="pointer-events-none absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-xl border theme-border bg-[var(--m3-surface)]/95 px-2.5 py-1 text-[11px] font-medium text-slate-600 shadow-sm dark:text-slate-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Abfrage läuft…</span>
                  </div>
                )}
                <ResponsiveContainer width="100%" height="100%">
                  {chartKind === 'bar' ? (
                    <BarChart data={seriesData} margin={{top: 12, right: effectiveDualClimate ? 8 : 12, left: -12, bottom: 4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
                      <XAxis
                        dataKey="time"
                        tick={{fontSize: 11, fill: '#94A3B8'}}
                        tickLine={false}
                        axisLine={{stroke: 'rgba(148,163,184,0.25)'}}
                        minTickGap={24}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{fontSize: 11, fill: '#94A3B8'}}
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(v: number) => `${v}${activeReading.unit ? ` ${activeReading.unit}` : ''}`}
                        width={62}
                      />
                      {effectiveDualClimate && (
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{fontSize: 11, fill: '#38BDF8'}}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          tickFormatter={(v: number) => `${v}%`}
                          width={44}
                        />
                      )}
                      <Tooltip
                        content={({active, payload}) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const pt = payload[0].payload as {fullTime: string};
                          return (
                            <div className="rounded-2xl border theme-border bg-[var(--m3-surface)] px-3.5 py-2.5 text-xs shadow-xl">
                              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
                                {pt.fullTime}
                              </div>
                              <div className="space-y-1">
                                {payload.map((item) => (
                                  <div key={String(item.dataKey)} className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                                      <span
                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                        style={{backgroundColor: item.color}}
                                      />
                                      <span className="truncate max-w-[150px]">{item.name}</span>
                                    </span>
                                    <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                      {item.dataKey === 'secondaryValue'
                                        ? formatReadingMetric(Number(item.value), humidityMeta)
                                        : formatReadingMetric(Number(item.value), activeReading)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{fontSize: '12px', paddingTop: '8px'}} />
                      <Bar
                        yAxisId="left"
                        dataKey="value"
                        name={`${activeEntry.device.alias} (${activeReading.shortLabel})`}
                        fill={activeReading.color}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={22}
                      />
                      {effectiveDualClimate && (
                        <Bar
                          yAxisId="right"
                          dataKey="secondaryValue"
                          name="Luftfeuchtigkeit (% rF)"
                          fill={humidityMeta.color}
                          radius={[6, 6, 0, 0]}
                          maxBarSize={18}
                          fillOpacity={0.75}
                        />
                      )}
                      {compareDevice && (
                        <Bar
                          yAxisId="left"
                          dataKey="compareValue"
                          name={`${compareDevice.alias} (${activeReading.shortLabel})`}
                          fill="#8B5CF6"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={18}
                          fillOpacity={0.8}
                        />
                      )}
                    </BarChart>
                  ) : chartKind === 'line' ? (
                    <LineChart data={seriesData} margin={{top: 12, right: effectiveDualClimate ? 8 : 12, left: -12, bottom: 4}}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
                      <XAxis
                        dataKey="time"
                        tick={{fontSize: 11, fill: '#94A3B8'}}
                        tickLine={false}
                        axisLine={{stroke: 'rgba(148,163,184,0.25)'}}
                        minTickGap={24}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{fontSize: 11, fill: '#94A3B8'}}
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(v: number) => `${v}${activeReading.unit ? ` ${activeReading.unit}` : ''}`}
                        width={62}
                      />
                      {effectiveDualClimate && (
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{fontSize: 11, fill: '#38BDF8'}}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          tickFormatter={(v: number) => `${v}%`}
                          width={44}
                        />
                      )}
                      <Tooltip
                        content={({active, payload}) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const pt = payload[0].payload as {fullTime: string};
                          return (
                            <div className="rounded-2xl border theme-border bg-[var(--m3-surface)] px-3.5 py-2.5 text-xs shadow-xl">
                              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
                                {pt.fullTime}
                              </div>
                              <div className="space-y-1">
                                {payload.map((item) => (
                                  <div key={String(item.dataKey)} className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                                      <span
                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                        style={{backgroundColor: item.color}}
                                      />
                                      <span className="truncate max-w-[150px]">{item.name}</span>
                                    </span>
                                    <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                      {item.dataKey === 'secondaryValue'
                                        ? formatReadingMetric(Number(item.value), humidityMeta)
                                        : formatReadingMetric(Number(item.value), activeReading)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{fontSize: '12px', paddingTop: '8px'}} />
                      {stats && (
                        <ReferenceLine
                          yAxisId="left"
                          y={Number(stats.avg.toFixed(activeReading.decimals))}
                          stroke="rgba(148,163,184,0.55)"
                          strokeDasharray="4 4"
                        />
                      )}
                      {desiredTempValue !== undefined && (
                        <ReferenceLine
                          yAxisId="left"
                          y={desiredTempValue}
                          stroke="#EF4444"
                          strokeDasharray="5 3"
                        />
                      )}
                      <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="value"
                        name={`${activeEntry.device.alias} (${activeReading.shortLabel})`}
                        stroke={activeReading.color}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{r: 5, strokeWidth: 0}}
                      />
                      {effectiveDualClimate && (
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="secondaryValue"
                          name="Luftfeuchtigkeit (% rF)"
                          stroke={humidityMeta.color}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{r: 4, strokeWidth: 0}}
                        />
                      )}
                      {compareDevice && (
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="compareValue"
                          name={`${compareDevice.alias} (${activeReading.shortLabel})`}
                          stroke="#8B5CF6"
                          strokeWidth={2.2}
                          strokeDasharray="6 3"
                          dot={false}
                          activeDot={{r: 4, strokeWidth: 0}}
                        />
                      )}
                    </LineChart>
                  ) : (
                    <AreaChart data={seriesData} margin={{top: 12, right: effectiveDualClimate ? 8 : 12, left: -12, bottom: 4}}>
                      <defs>
                        <linearGradient id="sensorPrimaryGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={activeReading.color} stopOpacity={0.34} />
                          <stop offset="95%" stopColor={activeReading.color} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="sensorSecondaryGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={humidityMeta.color} stopOpacity={0.24} />
                          <stop offset="95%" stopColor={humidityMeta.color} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="sensorCompareGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.22} />
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.22)" vertical={false} />
                      <XAxis
                        dataKey="time"
                        tick={{fontSize: 11, fill: '#94A3B8'}}
                        tickLine={false}
                        axisLine={{stroke: 'rgba(148,163,184,0.25)'}}
                        minTickGap={24}
                      />
                      <YAxis
                        yAxisId="left"
                        tick={{fontSize: 11, fill: '#94A3B8'}}
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(v: number) => `${v}${activeReading.unit ? ` ${activeReading.unit}` : ''}`}
                        width={62}
                      />
                      {effectiveDualClimate && (
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          tick={{fontSize: 11, fill: '#38BDF8'}}
                          tickLine={false}
                          axisLine={false}
                          domain={[0, 100]}
                          tickFormatter={(v: number) => `${v}%`}
                          width={44}
                        />
                      )}
                      <Tooltip
                        content={({active, payload}) => {
                          if (!active || !payload || payload.length === 0) return null;
                          const pt = payload[0].payload as {fullTime: string};
                          return (
                            <div className="rounded-2xl border theme-border bg-[var(--m3-surface)] px-3.5 py-2.5 text-xs shadow-xl">
                              <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mb-1.5 tabular-nums">
                                {pt.fullTime}
                              </div>
                              <div className="space-y-1">
                                {payload.map((item) => (
                                  <div key={String(item.dataKey)} className="flex items-center justify-between gap-4">
                                    <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                                      <span
                                        className="h-2.5 w-2.5 rounded-full shrink-0"
                                        style={{backgroundColor: item.color}}
                                      />
                                      <span className="truncate max-w-[150px]">{item.name}</span>
                                    </span>
                                    <span className="font-mono font-bold tabular-nums text-slate-900 dark:text-slate-100">
                                      {item.dataKey === 'secondaryValue'
                                        ? formatReadingMetric(Number(item.value), humidityMeta)
                                        : formatReadingMetric(Number(item.value), activeReading)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      <Legend wrapperStyle={{fontSize: '12px', paddingTop: '8px'}} />
                      {stats && (
                        <ReferenceLine
                          yAxisId="left"
                          y={Number(stats.avg.toFixed(activeReading.decimals))}
                          stroke="rgba(148,163,184,0.55)"
                          strokeDasharray="4 4"
                        />
                      )}
                      {desiredTempValue !== undefined && (
                        <ReferenceLine
                          yAxisId="left"
                          y={desiredTempValue}
                          stroke="#EF4444"
                          strokeDasharray="5 3"
                        />
                      )}
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="value"
                        name={`${activeEntry.device.alias} (${activeReading.shortLabel})`}
                        stroke={activeReading.color}
                        strokeWidth={2.5}
                        fill="url(#sensorPrimaryGrad)"
                        activeDot={{r: 5, strokeWidth: 0}}
                      />
                      {effectiveDualClimate && (
                        <Area
                          yAxisId="right"
                          type="monotone"
                          dataKey="secondaryValue"
                          name="Luftfeuchtigkeit (% rF)"
                          stroke={humidityMeta.color}
                          strokeWidth={2}
                          fill="url(#sensorSecondaryGrad)"
                          activeDot={{r: 4, strokeWidth: 0}}
                        />
                      )}
                      {compareDevice && (
                        <Area
                          yAxisId="left"
                          type="monotone"
                          dataKey="compareValue"
                          name={`${compareDevice.alias} (${activeReading.shortLabel})`}
                          stroke="#8B5CF6"
                          strokeWidth={2.2}
                          fill="url(#sensorCompareGrad)"
                          activeDot={{r: 4, strokeWidth: 0}}
                        />
                      )}
                    </AreaChart>
                  )}
                </ResponsiveContainer>
              </div>
            </div>

            {/* Compact Latest Readings Table */}
            <div className="rounded-3xl border theme-surface overflow-hidden">
              <div className="flex items-center justify-between border-b theme-border px-4 py-3">
                <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Messwerte im gewählten Zeitraum (Auszug)
                </h3>
                <span className="font-mono text-[11px] tabular-nums text-slate-400">
                  {seriesData.length} Datenpunkte
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b theme-border text-[11px] text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-2.5 font-medium">Zeitpunkt</th>
                      <th className="px-4 py-2.5 font-medium text-right">{activeReading.label}</th>
                      {effectiveDualClimate && (
                        <th className="px-4 py-2.5 font-medium text-right">Luftfeuchtigkeit</th>
                      )}
                      {compareDevice && (
                        <th className="px-4 py-2.5 font-medium text-right">{compareDevice.alias}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-white/[0.06] font-mono tabular-nums">
                    {seriesData
                      .slice(-8)
                      .reverse()
                      .map((pt) => (
                        <tr key={pt.timestamp} className="hover:bg-slate-50/70 dark:hover:bg-white/[0.02]">
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{pt.fullTime}</td>
                          <td className="px-4 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                            {formatReadingMetric(pt.value, activeReading)}
                          </td>
                          {effectiveDualClimate && (
                            <td className="px-4 py-2 text-right text-sky-600 dark:text-sky-400">
                              {pt.secondaryValue !== undefined
                                ? formatReadingMetric(pt.secondaryValue, humidityMeta)
                                : '—'}
                            </td>
                          )}
                          {compareDevice && (
                            <td className="px-4 py-2 text-right text-violet-600 dark:text-violet-400">
                              {pt.compareValue !== undefined
                                ? formatReadingMetric(pt.compareValue, activeReading)
                                : '—'}
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        ) : (
          <div className="lg:col-span-8 rounded-3xl border border-dashed theme-surface p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Keine Geräte mit numerischen Sensor-Readings gefunden.
          </div>
        )}
      </div>
    </div>
  );
};
