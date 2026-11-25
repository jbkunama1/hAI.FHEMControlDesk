import React, {useEffect, useMemo, useState} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ImagePlus,
  LineChart,
  Minus,
  Plus,
  Power,
  RefreshCw,
  Send,
  Square,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type {FhemDevice} from '../types/fhem';
import {generateDeviceHistory} from '../lib/fhemSeedData';
import {extractChartableReadings} from '../lib/sensorHistory';
import {SmartVisualImage} from './SmartVisualImage';
import {ColorPickerControl} from './ColorPickerControl';

interface DeviceDetailSheetProps {
  device: FhemDevice | null;
  isFavorite: boolean;
  deviceImage?: string | null;
  onClose: () => void;
  onToggleFavorite: (deviceName: string) => void;
  onEditDeviceImage?: (device: FhemDevice) => void;
  onOpenChart?: (deviceName: string, readingKey?: string) => void;
  onExecuteCommand: (cmd: string) => Promise<{ok: boolean; data: string; errorMessage?: string}>;
  onRequestDeleteDevice: (device: FhemDevice) => void;
}

type DetailTab = 'control' | 'readings' | 'attributes';

export const DeviceDetailSheet: React.FC<DeviceDetailSheetProps> = ({
  device,
  isFavorite,
  deviceImage = null,
  onClose,
  onToggleFavorite,
  onEditDeviceImage,
  onOpenChart,
  onExecuteCommand,
  onRequestDeleteDevice,
}) => {
  const [activeTab, setActiveTab] = useState<DetailTab>('control');
  const [pctVal, setPctVal] = useState(0);
  const [ctVal, setCtVal] = useState(2900);
  const [customSetCmd, setCustomSetCmd] = useState('');
  const [readingFilter, setReadingFilter] = useState('');
  const [getResultBanner, setGetResultBanner] = useState<string | null>(null);

  // Attribute editor state
  const [newAttrKey, setNewAttrKey] = useState('alias');
  const [newAttrVal, setNewAttrVal] = useState('');
  const [editingAttrKey, setEditingAttrKey] = useState<string | null>(null);
  const [editingAttrVal, setEditingAttrVal] = useState('');
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  useEffect(() => {
    if (device) {
      setPctVal(device.pct ?? 0);
      setCtVal(device.ct ?? 2900);
      setGetResultBanner(null);
      setEditingAttrKey(null);
      setActiveTab('control');
    }
  }, [device?.name]);

  const historyKind: 'temperature' | 'pct' | 'power' | 'binary' = useMemo(() => {
    if (!device) return 'binary';
    if (device.temperature !== undefined) return 'temperature';
    if (device.isDimmable || device.isShutter) return 'pct';
    if (device.power !== undefined) return 'power';
    return 'binary';
  }, [device]);

  const historyPoints = useMemo(() => {
    if (!device) return [];
    const cur =
      historyKind === 'temperature'
        ? (device.temperature ?? 21)
        : historyKind === 'pct'
          ? (device.pct ?? 0)
          : historyKind === 'power'
            ? (device.power ?? 0)
            : device.statusTone === 'active'
              ? 1
              : 0;
    return generateDeviceHistory(device.name, historyKind, cur);
  }, [device, historyKind]);

  const chartableReadings = useMemo(
    () => (device ? extractChartableReadings(device) : []),
    [device]
  );

  const chartableReadingSet = useMemo(
    () => new Set(chartableReadings.map((r) => r.key)),
    [chartableReadings]
  );

  if (!device) return null;

  const isActive = device.statusTone === 'active';
  const filteredReadings = Object.entries(device.readings).filter(([k, r]) => {
    const q = readingFilter.trim().toLowerCase();
    if (!q) return true;
    return k.toLowerCase().includes(q) || r.Value.toLowerCase().includes(q);
  });

  // Chart calculations
  const values = historyPoints.map((p) => p.value);
  const minVal = Math.min(...values, 0);
  const maxVal = Math.max(...values, historyKind === 'pct' ? 100 : historyKind === 'binary' ? 1 : 10);
  const range = Math.max(0.5, maxVal - minVal);
  const chartW = 560;
  const chartH = 140;
  const padX = 12;
  const padY = 14;

  const svgPoints = historyPoints.map((pt, i) => {
    const x = padX + (i / Math.max(1, historyPoints.length - 1)) * (chartW - padX * 2);
    const y = chartH - padY - ((pt.value - minVal) / range) * (chartH - padY * 2);
    return {x, y, pt};
  });

  const linePath = svgPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath =
    svgPoints.length > 1
      ? `${linePath} L ${svgPoints[svgPoints.length - 1].x.toFixed(1)} ${chartH - padY} L ${svgPoints[0].x.toFixed(1)} ${chartH - padY} Z`
      : '';

  const activePoint = hoverIdx !== null && svgPoints[hoverIdx] ? svgPoints[hoverIdx] : svgPoints[svgPoints.length - 1];

  const handleGetReading = async (readingName: string) => {
    const res = await onExecuteCommand(`get ${device.name} ${readingName}`);
    if (res.ok) {
      setGetResultBanner(`get ${device.name} ${readingName} → ${res.data || 'OK'}`);
    } else {
      setGetResultBanner(`Fehler: ${res.errorMessage || 'Abfrage fehlgeschlagen'}`);
    }
  };

  const handleSaveAttr = async (key: string, val: string) => {
    const cleanKey = key.trim();
    const cleanVal = val.trim();
    if (!cleanKey || !cleanVal) return;
    await onExecuteCommand(`attr ${device.name} ${cleanKey} ${cleanVal}`);
    setEditingAttrKey(null);
    setNewAttrVal('');
  };

  const handleDeleteAttr = async (key: string) => {
    await onExecuteCommand(`deleteattr ${device.name} ${key}`);
  };

  const handleCustomSet = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customSetCmd.trim();
    if (!trimmed) return;
    await onExecuteCommand(`set ${device.name} ${trimmed}`);
    setCustomSetCmd('');
  };

  const statusTextColor =
    device.statusTone === 'active'
      ? 'text-emerald-600 dark:text-emerald-400'
      : device.statusTone === 'error'
        ? 'text-red-600 dark:text-red-400'
        : device.statusTone === 'warning'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-slate-500 dark:text-slate-400';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end bg-black/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={`Details für ${device.alias}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] lg:max-h-full w-full lg:max-w-xl flex-col overflow-hidden rounded-t-3xl lg:rounded-none lg:rounded-l-3xl border-t lg:border-t-0 lg:border-l theme-surface shadow-2xl">
        {/* Mobile drag handle */}
        <div className="mx-auto mt-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 lg:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b theme-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-lg font-bold text-slate-900 dark:text-slate-100">
              {device.alias}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">{device.name}</span>
              <span aria-hidden="true">·</span>
              <span>{device.type}</span>
              <span aria-hidden="true">·</span>
              <span className={`font-semibold ${statusTextColor}`}>{device.statusLabel}</span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {onOpenChart && chartableReadings.length > 0 && (
              <button
                type="button"
                onClick={() => onOpenChart(device.name, chartableReadings[0]?.key)}
                aria-label="Verlaufsdiagramm öffnen"
                title="Sensor-Verlauf im Diagramm öffnen"
                className="flex h-11 w-11 items-center justify-center rounded-xl theme-text hover:bg-slate-100 dark:hover:bg-white/[0.08]"
              >
                <LineChart className="h-5 w-5" />
              </button>
            )}
            {onEditDeviceImage && (
              <button
                type="button"
                onClick={() => onEditDeviceImage(device)}
                aria-label="Gerätebild ändern"
                title="Gerätebild hinzufügen oder ändern"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.08]"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onToggleFavorite(device.name)}
              aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Als Favorit markieren'}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.08]"
            >
              <Star className={`h-5 w-5 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Details schließen"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.08]"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Optional Device Custom Photo Banner */}
        {deviceImage && (
          <div className="px-5 pt-3">
            <div className="relative h-32 w-full overflow-hidden rounded-2xl border theme-border">
              <SmartVisualImage
                src={deviceImage}
                alt={`Foto von ${device.alias}`}
                label={device.primaryRoom}
                className="h-full w-full"
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
              {onEditDeviceImage && (
                <button
                  type="button"
                  onClick={() => onEditDeviceImage(device)}
                  className="absolute bottom-2.5 right-2.5 flex min-h-[34px] items-center gap-1.5 rounded-xl bg-black/60 px-3 text-[11px] font-semibold text-white backdrop-blur-xs hover:bg-black/75"
                >
                  <ImagePlus className="h-3.5 w-3.5" />
                  Bild ändern
                </button>
              )}
            </div>
          </div>
        )}

        {/* Segmented Tab Control */}
        <div className="px-5 pt-3">
          <div className="grid grid-cols-3 gap-1 rounded-2xl theme-surface-alt p-1">
            {(
              [
                {id: 'control', label: 'Steuerung'},
                {id: 'readings', label: `Readings (${Object.keys(device.readings).length})`},
                {id: 'attributes', label: `Attribute (${Object.keys(device.attributes).length})`},
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`min-h-[40px] rounded-xl px-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-[var(--m3-surface)] text-slate-900 shadow-xs dark:text-slate-100'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {activeTab === 'control' && (
            <>
              {/* Primary Power / State Controls */}
              {device.isSwitchable && (
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => onExecuteCommand(`set ${device.name} on`)}
                    className={`flex min-h-[48px] items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-colors ${
                      isActive
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200'
                    }`}
                  >
                    <Power className="h-4 w-4" />
                    Ein (on)
                  </button>
                  <button
                    type="button"
                    onClick={() => onExecuteCommand(`set ${device.name} off`)}
                    className={`flex min-h-[48px] items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-colors ${
                      !isActive
                        ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200'
                    }`}
                  >
                    Aus (off)
                  </button>
                  <button
                    type="button"
                    onClick={() => onExecuteCommand(`set ${device.name} toggle`)}
                    className="flex min-h-[48px] items-center justify-center rounded-2xl bg-slate-100 text-sm font-semibold text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200"
                  >
                    Toggle
                  </button>
                </div>
              )}

              {/* Dimmable & RGB Color Light Controls */}
              {(device.isDimmable || device.isColorLight) && (
                <div className="space-y-4 rounded-2xl border border-slate-200/80 p-4 dark:border-[#242D3B]">
                  {device.isDimmable && (
                    <div>
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Helligkeit (pct)</span>
                        <span className="font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {pctVal}%
                        </span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={pctVal}
                        onChange={(e) => setPctVal(Number(e.target.value))}
                        onMouseUp={() => onExecuteCommand(`set ${device.name} pct ${pctVal}`)}
                        onTouchEnd={() => onExecuteCommand(`set ${device.name} pct ${pctVal}`)}
                        className="m3-slider w-full"
                        style={{
                          background: `linear-gradient(to right, #22C55E ${pctVal}%, rgba(148,163,184,0.28) ${pctVal}%)`,
                          borderRadius: '9999px',
                          height: '10px',
                        }}
                      />
                      <div className="mt-2.5 grid grid-cols-5 gap-1.5">
                        {[0, 25, 50, 75, 100].map((v) => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => {
                              setPctVal(v);
                              onExecuteCommand(`set ${device.name} pct ${v}`);
                            }}
                            className="min-h-[38px] rounded-xl bg-slate-100 font-mono text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-300 dark:hover:bg-[#232C3A]"
                          >
                            {v}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {device.isColorLight && (
                    <ColorPickerControl
                      deviceAlias={device.alias}
                      rgb={device.rgb}
                      variant="full"
                      onChangeRgb={(hex) => {
                        void onExecuteCommand(`set ${device.name} rgb ${hex}`);
                      }}
                    />
                  )}

                  {device.possibleSets.includes('ct') && (
                    <div className="border-t border-slate-100 pt-3.5 dark:border-[#1F2734]">
                      <div className="mb-2 flex items-center justify-between text-xs">
                        <span className="font-medium text-slate-600 dark:text-slate-300">Farbtemperatur (ct)</span>
                        <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          {ctVal} K
                        </span>
                      </div>
                      <input
                        type="range"
                        min={2200}
                        max={6500}
                        step={100}
                        value={ctVal}
                        onChange={(e) => setCtVal(Number(e.target.value))}
                        onMouseUp={() => onExecuteCommand(`set ${device.name} ct ${ctVal}`)}
                        onTouchEnd={() => onExecuteCommand(`set ${device.name} ct ${ctVal}`)}
                        className="m3-slider w-full"
                        style={{
                          background: 'linear-gradient(to right, #F59E0B, #FEF3C7, #93C5FD)',
                          borderRadius: '9999px',
                          height: '10px',
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Shutter Controls */}
              {device.isShutter && (
                <div className="space-y-4 rounded-2xl border border-slate-200/80 p-4 dark:border-[#242D3B]">
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => onExecuteCommand(`set ${device.name} up`)}
                      className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-800 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-100"
                    >
                      <ArrowUp className="h-4 w-4" />
                      Auf
                    </button>
                    <button
                      type="button"
                      onClick={() => onExecuteCommand(`set ${device.name} stop`)}
                      className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-800 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-100"
                    >
                      <Square className="h-3.5 w-3.5" />
                      Stop
                    </button>
                    <button
                      type="button"
                      onClick={() => onExecuteCommand(`set ${device.name} down`)}
                      className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-slate-100 text-sm font-semibold text-slate-800 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-100"
                    >
                      <ArrowDown className="h-4 w-4" />
                      Ab
                    </button>
                  </div>
                  <div>
                    <div className="mb-2 flex justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-300">Position (pct)</span>
                      <span className="font-mono font-bold tabular-nums">{pctVal}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={pctVal}
                      onChange={(e) => setPctVal(Number(e.target.value))}
                      onMouseUp={() => onExecuteCommand(`set ${device.name} pct ${pctVal}`)}
                      onTouchEnd={() => onExecuteCommand(`set ${device.name} pct ${pctVal}`)}
                      className="m3-slider w-full"
                      style={{
                        background: `linear-gradient(to right, var(--accent-primary) ${pctVal}%, rgba(148,163,184,0.28) ${pctVal}%)`,
                        borderRadius: '9999px',
                        height: '10px',
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Thermostat Controls */}
              {device.isThermostat && (
                <div className="space-y-4 rounded-2xl border theme-border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Soll-Temperatur</div>
                      <div className="font-display text-3xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {device.desiredTemp?.toFixed(1) ?? '21.0'} °C
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        Ist: {device.temperature?.toFixed(1) ?? '--'} °C · Ventil: {device.readings.valve?.Value ?? '0'}% · Modus: {device.readings.controlMode?.Value ?? 'auto'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(12, Math.round(((device.desiredTemp ?? 21) - 0.5) * 2) / 2);
                          onExecuteCommand(`set ${device.name} desired-temp ${next.toFixed(1)}`);
                        }}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl theme-surface-alt text-slate-800 hover:opacity-85 dark:text-slate-100"
                      >
                        <Minus className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(28, Math.round(((device.desiredTemp ?? 21) + 0.5) * 2) / 2);
                          onExecuteCommand(`set ${device.name} desired-temp ${next.toFixed(1)}`);
                        }}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl theme-btn-primary transition-colors"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['auto', 'manual', 'boost'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => onExecuteCommand(`set ${device.name} ${mode}`)}
                        className={`min-h-[42px] rounded-xl text-xs font-semibold capitalize transition-colors ${
                          device.readings.controlMode?.Value === mode
                            ? 'theme-btn-primary'
                            : 'theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-300'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Clickable Sensor Readings → Direct Jump to ChartsView */}
              {onOpenChart && chartableReadings.length > 0 && (
                <div className="rounded-2xl border theme-border p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        Sensor-Messwerte & Verlauf
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Tippen, um das zugehörige Verlaufsdiagramm direkt zu öffnen
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenChart(device.name, chartableReadings[0]?.key)}
                      className="flex min-h-[36px] items-center gap-1.5 rounded-xl theme-tonal px-3 text-xs font-semibold hover:opacity-90 whitespace-nowrap shrink-0"
                    >
                      <LineChart className="h-3.5 w-3.5" />
                      Diagramm
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {chartableReadings.slice(0, 6).map((reading) => (
                      <button
                        key={reading.key}
                        type="button"
                        onClick={() => onOpenChart(device.name, reading.key)}
                        className="group flex items-center justify-between gap-2 rounded-xl border theme-border bg-[var(--m3-canvas)] px-3 py-2.5 text-left transition-colors hover:border-[var(--accent-ring)]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{backgroundColor: reading.color}}
                              aria-hidden="true"
                            />
                            <span className="truncate">{reading.label}</span>
                          </div>
                          <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
                            {reading.formattedValue}
                          </div>
                        </div>
                        <LineChart className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-[var(--accent-primary)]" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick webCmd / Scene Actions */}
              {device.webCmds.length > 0 && (
                <div>
                  <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                    Schnellbefehle (webCmd)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {device.webCmds
                      .filter((w) => !['pct', 'ct', 'desired-temp', 'scene'].includes(w))
                      .map((cmdItem) => (
                        <button
                          key={cmdItem}
                          type="button"
                          onClick={() => {
                            const isLightScene = device.type === 'LightScene';
                            onExecuteCommand(
                              isLightScene
                                ? `set ${device.name} scene ${cmdItem}`
                                : `set ${device.name} ${cmdItem}`
                            );
                          }}
                          className="min-h-[40px] rounded-xl bg-slate-100 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200 dark:hover:bg-[#232C3A]"
                        >
                          {cmdItem}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Custom FHEM set command */}
              <form onSubmit={handleCustomSet} className="space-y-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                  Direkter set-Befehl
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customSetCmd}
                    onChange={(e) => setCustomSetCmd(e.target.value)}
                    placeholder={`z. B. ${device.possibleSets.split(' ')[0] || 'on'}`}
                    className="min-h-[44px] flex-1 rounded-xl border theme-border bg-white px-3.5 font-mono text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                  />
                  <button
                    type="submit"
                    className="flex min-h-[44px] items-center gap-1.5 rounded-xl theme-btn-primary px-4 text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Senden
                  </button>
                </div>
              </form>

              {/* Device Info & Definition */}
              <div className="rounded-2xl border border-slate-200/80 p-4 text-xs space-y-2 dark:border-[#242D3B]">
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 dark:text-slate-400">Räume</span>
                  <span className="font-medium text-slate-900 dark:text-slate-100 text-right">{device.rooms.join(', ')}</span>
                </div>
                {device.model && (
                  <div className="flex justify-between gap-4">
                    <span className="text-slate-500 dark:text-slate-400">Modell</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100 text-right">{device.model}</span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-slate-500 dark:text-slate-400">Letzte Änderung</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-slate-100">{device.stateTime || '—'}</span>
                </div>
                {device.def && (
                  <div className="pt-2 border-t border-slate-100 dark:border-[#1F2734]">
                    <div className="text-slate-500 dark:text-slate-400 mb-1">Definition (DEF)</div>
                    <code className="block break-all rounded-xl bg-slate-100 p-2.5 font-mono text-[11px] text-slate-800 dark:bg-[#0E1116] dark:text-slate-200">
                      {device.def}
                    </code>
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'readings' && (
            <>
              {/* 24h History Visualization */}
              <div className="rounded-2xl border border-slate-200/80 p-4 dark:border-[#242D3B]">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div>
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Verlauf (letzte 24 Stunden)
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {activePoint ? `${activePoint.pt.time} Uhr · ${activePoint.pt.label}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
                      Min {Math.min(...values).toFixed(historyKind === 'temperature' ? 1 : 0)} · Max{' '}
                      {Math.max(...values).toFixed(historyKind === 'temperature' ? 1 : 0)}
                    </span>
                    {onOpenChart && chartableReadings.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpenChart(device.name, chartableReadings[0]?.key)}
                        className="flex min-h-[34px] items-center gap-1 rounded-xl theme-tonal px-2.5 text-[11px] font-semibold hover:opacity-90 whitespace-nowrap"
                      >
                        <LineChart className="h-3.5 w-3.5" />
                        Vollbild-Chart
                      </button>
                    )}
                  </div>
                </div>

                <svg
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="h-36 w-full overflow-visible"
                  onMouseLeave={() => setHoverIdx(null)}
                >
                  <defs>
                    <linearGradient id="fhemHistGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-ring)" stopOpacity="0.32" />
                      <stop offset="100%" stopColor="var(--accent-ring)" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {areaPath && <path d={areaPath} fill="url(#fhemHistGrad)" />}
                  {linePath && (
                    <path
                      d={linePath}
                      fill="none"
                      stroke="var(--accent-ring)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}
                  {svgPoints.map((p, idx) => (
                    <g key={p.pt.timestamp}>
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={hoverIdx === idx ? 5 : 2.5}
                        fill="var(--accent-ring)"
                        className="transition-all"
                      />
                      <rect
                        x={p.x - 10}
                        y={0}
                        width={20}
                        height={chartH}
                        fill="transparent"
                        onMouseEnter={() => setHoverIdx(idx)}
                        onClick={() => setHoverIdx(idx)}
                      />
                    </g>
                  ))}
                </svg>

                <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-slate-400">
                  <span>{historyPoints[0]?.time}</span>
                  <span>{historyPoints[Math.floor(historyPoints.length / 2)]?.time}</span>
                  <span>Jetzt</span>
                </div>
              </div>

              {getResultBanner && (
                <div className="rounded-xl theme-tonal px-3.5 py-2.5 font-mono text-xs">
                  {getResultBanner}
                </div>
              )}

              {/* Search Readings */}
              <div>
                <input
                  type="text"
                  value={readingFilter}
                  onChange={(e) => setReadingFilter(e.target.value)}
                  placeholder="Readings filtern..."
                  className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
              </div>

              {/* Readings Table */}
              <div className="overflow-hidden rounded-2xl border border-slate-200/80 divide-y divide-slate-100 dark:border-[#242D3B] dark:divide-[#1F2734]">
                {filteredReadings.map(([rKey, reading]) => {
                  const isChartable = Boolean(onOpenChart && chartableReadingSet.has(rKey));
                  return (
                    <div
                      key={rKey}
                      className={`flex items-center justify-between gap-3 px-3.5 py-2.5 ${
                        isChartable ? 'hover:bg-slate-50/90 dark:hover:bg-white/[0.03] transition-colors' : ''
                      }`}
                    >
                      {isChartable ? (
                        <button
                          type="button"
                          onClick={() => onOpenChart?.(device.name, rKey)}
                          className="min-w-0 flex-1 text-left focus-visible:outline-none"
                          title={`Diagramm für ${rKey} öffnen`}
                        >
                          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                            <span>{rKey}</span>
                            <LineChart className="h-3.5 w-3.5 theme-text shrink-0" />
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
                            {reading.Time} · Tippen für Verlauf
                          </div>
                        </button>
                      ) : (
                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                            {rKey}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] tabular-nums text-slate-400">
                            {reading.Time}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="max-w-[140px] truncate font-mono text-xs font-medium tabular-nums text-slate-900 dark:text-slate-100">
                          {reading.Value}
                        </span>
                        {isChartable && (
                          <button
                            type="button"
                            onClick={() => onOpenChart?.(device.name, rKey)}
                            title={`Verlaufsdiagramm für ${rKey} öffnen`}
                            aria-label={`Diagramm für ${rKey} öffnen`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg theme-text hover:bg-slate-100 dark:hover:bg-[#1B222D]"
                          >
                            <LineChart className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleGetReading(rKey)}
                          title={`get ${device.name} ${rKey}`}
                          aria-label={`Reading ${rKey} neu abfragen`}
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-[#1B222D] dark:hover:text-blue-400"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === 'attributes' && (
            <>
              {/* Add or Update Attribute Form */}
              <div className="rounded-2xl border border-slate-200/80 p-4 space-y-3 dark:border-[#242D3B]">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  Attribut setzen (attr {device.name})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    list="fhem-common-attrs"
                    value={newAttrKey}
                    onChange={(e) => setNewAttrKey(e.target.value)}
                    placeholder="Attribut (z. B. room, alias, webCmd)"
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  />
                  <datalist id="fhem-common-attrs">
                    <option value="alias" />
                    <option value="room" />
                    <option value="webCmd" />
                    <option value="group" />
                    <option value="icon" />
                    <option value="comment" />
                    <option value="disable" />
                  </datalist>
                  <input
                    type="text"
                    value={newAttrVal}
                    onChange={(e) => setNewAttrVal(e.target.value)}
                    placeholder="Wert"
                    className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-3 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleSaveAttr(newAttrKey, newAttrVal)}
                  disabled={!newAttrKey.trim() || !newAttrVal.trim()}
                  className="min-h-[44px] w-full rounded-xl theme-btn-primary text-xs font-semibold transition-colors disabled:opacity-50"
                >
                  Attribut anwenden
                </button>
              </div>

              {/* Existing Attributes List */}
              <div className="overflow-hidden rounded-2xl border theme-border divide-y divide-slate-100 dark:divide-white/[0.06]">
                {Object.entries(device.attributes).map(([aKey, aVal]) => {
                  const isEditing = editingAttrKey === aKey;
                  return (
                    <div key={aKey} className="px-3.5 py-3">
                      {isEditing ? (
                        <div className="space-y-2">
                          <div className="font-mono text-xs font-semibold theme-text">
                            {aKey}
                          </div>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={editingAttrVal}
                              onChange={(e) => setEditingAttrVal(e.target.value)}
                              className="min-h-[40px] flex-1 rounded-xl border border-[var(--accent-ring)] bg-white px-3 text-xs text-slate-900 focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => handleSaveAttr(aKey, editingAttrVal)}
                              aria-label="Speichern"
                              className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAttrKey(null)}
                              aria-label="Abbrechen"
                              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-[#1B222D] dark:text-slate-300"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAttrKey(aKey);
                              setEditingAttrVal(aVal);
                            }}
                            className="min-w-0 flex-1 text-left"
                          >
                            <div className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {aKey}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-slate-900 dark:text-slate-100">
                              {aVal}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttr(aKey)}
                            aria-label={`Attribut ${aKey} löschen`}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-red-500/12 hover:text-red-600 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer Admin Bar */}
        <div className="flex items-center justify-between border-t border-slate-200/80 px-5 py-3 dark:border-[#242D3B]">
          <button
            type="button"
            onClick={() => onRequestDeleteDevice(device)}
            className="flex min-h-[44px] items-center gap-2 rounded-xl px-3 text-xs font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
            Gerät löschen (delete)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-slate-100 px-5 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200"
          >
            Fertig
          </button>
        </div>
      </div>
    </div>
  );
};
