import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  Clock,
  Cpu,
  ExternalLink,
  MemoryStick,
  RefreshCw,
  Server,
  Thermometer,
} from 'lucide-react';
import type {ConnectionStatus, FhemConnectionConfig, FhemDevice} from '../types/fhem';
import {executeFhemCommand} from '../lib/fhemClient';
import {
  detectSystemMonitorDevice,
  fetchFhemSystemMetrics,
  formatMemoryAmount,
  type FhemSystemHealthMetrics,
} from '../lib/systemHealth';

interface ServerHealthCardProps {
  devices: FhemDevice[];
  config: FhemConnectionConfig;
  connectionStatus?: ConnectionStatus;
  showVisuals: boolean;
  isMobileView?: boolean;
  onOpenDetail: (device: FhemDevice) => void;
}

function getMetricBarColor(percent: number | null, warnAt: number, critAt: number): string {
  if (percent === null) return 'var(--accent-primary)';
  if (percent >= critAt) return '#EF4444';
  if (percent >= warnAt) return '#F59E0B';
  return '#10B981';
}

function getMetricTextTone(percent: number | null, warnAt: number, critAt: number): string {
  if (percent === null) return 'text-slate-900 dark:text-slate-100';
  if (percent >= critAt) return 'text-red-600 dark:text-red-400';
  if (percent >= warnAt) return 'text-amber-600 dark:text-amber-400';
  return 'text-slate-900 dark:text-slate-100';
}

export const ServerHealthCard: React.FC<ServerHealthCardProps> = ({
  devices,
  config,
  connectionStatus,
  showVisuals,
  isMobileView = false,
  onOpenDetail,
}) => {
  const monitorDevice = useMemo(() => detectSystemMonitorDevice(devices), [devices]);
  const monitorName = monitorDevice?.name || '';

  const [metrics, setMetrics] = useState<FhemSystemHealthMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  const configRef = useRef(config);
  configRef.current = config;

  const loadMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchFhemSystemMetrics({
        config: configRef.current,
        devices: devicesRef.current,
        executeCmd: executeFhemCommand,
      });
      setMetrics(next);
    } catch {
      // Keep last known metrics on transient failure
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount, when connection or detected SYSMON device changes, and every 60s
  useEffect(() => {
    let active = true;
    setLoading(true);

    void fetchFhemSystemMetrics({
      config: configRef.current,
      devices: devicesRef.current,
      executeCmd: executeFhemCommand,
    })
      .then((res) => {
        if (active) {
          setMetrics(res);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });

    const intervalId = window.setInterval(() => {
      if (active) {
        void loadMetrics();
      }
    }, 60_000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    monitorName,
    config.mode,
    config.host,
    config.port,
    config.protocol,
    config.transport,
    loadMetrics,
  ]);

  const cpuPercentForBar = useMemo(() => {
    if (!metrics) return null;
    if (metrics.cpu.usagePercent !== null) return metrics.cpu.usagePercent;
    if (metrics.cpu.load1 !== null) return Math.min(100, Number(((metrics.cpu.load1 / 4) * 100).toFixed(1)));
    return null;
  }, [metrics]);

  const cpuPrimaryDisplay = useMemo(() => {
    if (!metrics) return '…';
    if (metrics.cpu.usagePercent !== null) {
      return `${metrics.cpu.usagePercent.toFixed(1).replace('.', ',')} %`;
    }
    if (metrics.cpu.load1 !== null) {
      return metrics.cpu.load1.toFixed(2).replace('.', ',');
    }
    return '—';
  }, [metrics]);

  const loadAvgDisplay = useMemo(() => {
    if (!metrics) return 'Lade CPU-Werte…';
    const {load1, load5, load15} = metrics.cpu;
    if (load1 !== null && load5 !== null && load15 !== null) {
      return `Load ${load1.toFixed(2)} · ${load5.toFixed(2)} · ${load15.toFixed(2)}`;
    }
    if (load1 !== null) {
      return `Load (1m): ${load1.toFixed(2)}`;
    }
    return 'Kein loadavg-Reading';
  }, [metrics]);

  const ramPercent = metrics?.memory.usedPercent ?? null;
  const ramPrimaryDisplay = useMemo(() => {
    if (!metrics) return '…';
    if (ramPercent !== null) return `${ramPercent.toFixed(1).replace('.', ',')} %`;
    if (metrics.memory.usedMb !== null) return formatMemoryAmount(metrics.memory.usedMb);
    return '—';
  }, [metrics, ramPercent]);

  const ramSecondaryDisplay = useMemo(() => {
    if (!metrics) return 'Lade Speicher…';
    const {usedMb, totalMb, rawText} = metrics.memory;
    if (usedMb !== null && totalMb !== null) {
      return `${formatMemoryAmount(usedMb)} / ${formatMemoryAmount(totalMb)}`;
    }
    if (usedMb !== null) return `Belegt: ${formatMemoryAmount(usedMb)}`;
    if (rawText) return rawText;
    return 'Kein RAM-Reading';
  }, [metrics]);

  const hostSubtitle = useMemo(() => {
    const parts: string[] = [];
    if (metrics?.monitorDeviceName) {
      parts.push(metrics.monitorDeviceName);
    }
    if (metrics?.hostModel) {
      parts.push(metrics.hostModel);
    } else if (connectionStatus?.fhemVersion) {
      parts.push(connectionStatus.fhemVersion);
    }
    if (parts.length === 0) {
      return config.mode === 'remote_server' ? `${config.host}:${config.port}` : 'FHEM Host';
    }
    return parts.join(' · ');
  }, [metrics, connectionStatus, config.mode, config.host, config.port]);

  const isOnline = connectionStatus ? connectionStatus.online : true;

  if (isMobileView) {
    const mobileCpuSub =
      metrics?.cpu.load1 !== null && metrics?.cpu.load1 !== undefined
        ? `Load ${metrics.cpu.load1.toFixed(2)}`
        : '—';

    return (
      <section
        aria-label="FHEM-Server Systemzustand"
        className="rounded-2xl border theme-surface p-3.5 space-y-2.5"
      >
        {/* Compact Single-Line Mobile Header */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl theme-tonal">
              <Server className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <h2 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  FHEM-Server
                </h2>
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}
                  aria-hidden="true"
                />
              </div>
              <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                {hostSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => void loadMetrics()}
              disabled={loading}
              aria-label="Server-Metriken aktualisieren"
              className="flex h-10 w-10 items-center justify-center rounded-xl border theme-border text-slate-600 active:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:active:bg-white/10"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {monitorDevice && (
              <button
                type="button"
                onClick={() => onOpenDetail(monitorDevice)}
                aria-label={`${monitorDevice.alias} öffnen`}
                className="flex h-10 w-10 items-center justify-center rounded-xl theme-surface-alt text-slate-700 active:opacity-80 dark:text-slate-200"
              >
                <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Row 1: 2-Column CPU & RAM */}
        <div className="grid grid-cols-2 gap-2.5">
          {/* CPU */}
          <div className="min-w-0 rounded-xl border theme-border bg-[var(--m3-canvas)]/70 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                <Cpu className="h-3.5 w-3.5 theme-text shrink-0" />
                <span>CPU</span>
              </span>
              {metrics?.cpu.cpuTempC !== null && metrics?.cpu.cpuTempC !== undefined && (
                <span className="font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {metrics.cpu.cpuTempC.toFixed(0)} °C
                </span>
              )}
            </div>
            <div
              className={`font-display text-xl font-bold tabular-nums leading-tight ${getMetricTextTone(
                cpuPercentForBar,
                65,
                85
              )}`}
            >
              {cpuPrimaryDisplay}
            </div>
            <div className="truncate font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
              {mobileCpuSub}
            </div>
            {showVisuals && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${cpuPercentForBar !== null ? Math.max(4, Math.min(100, cpuPercentForBar)) : 0}%`,
                    backgroundColor: getMetricBarColor(cpuPercentForBar, 65, 85),
                  }}
                />
              </div>
            )}
          </div>

          {/* RAM */}
          <div className="min-w-0 rounded-xl border theme-border bg-[var(--m3-canvas)]/70 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                <MemoryStick className="h-3.5 w-3.5 theme-text shrink-0" />
                <span>RAM</span>
              </span>
            </div>
            <div
              className={`font-display text-xl font-bold tabular-nums leading-tight ${getMetricTextTone(
                ramPercent,
                70,
                85
              )}`}
            >
              {ramPrimaryDisplay}
            </div>
            <div className="truncate font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
              {ramSecondaryDisplay}
            </div>
            {showVisuals && (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${ramPercent !== null ? Math.max(4, Math.min(100, ramPercent)) : 0}%`,
                    backgroundColor: getMetricBarColor(ramPercent, 70, 85),
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Full-Width Uptime Row (zero truncation) */}
        <div className="flex items-center justify-between gap-3 rounded-xl border theme-border bg-[var(--m3-canvas)]/70 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Clock className="h-3.5 w-3.5 theme-text shrink-0" />
              <span>Uptime</span>
            </div>
            <div className="mt-0.5 font-display text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {metrics ? metrics.uptimeText || '—' : '…'}
            </div>
            {metrics?.fhemUptimeText && metrics.fhemUptimeText !== metrics.uptimeText && (
              <div className="mt-0.5 truncate font-mono text-[10px] tabular-nums text-slate-500 dark:text-slate-400">
                FHEM: {metrics.fhemUptimeText}
              </div>
            )}
          </div>
          <span
            className={`shrink-0 rounded-lg px-2 py-1 font-mono text-[11px] font-semibold ${
              isOnline
                ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-500/12 text-red-700 dark:text-red-400'
            }`}
          >
            {isOnline ? 'Aktiv' : 'Offline'}
          </span>
        </div>

        {metrics && !metrics.monitorDeviceName && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Tipp: <code className="font-mono">SYSMON</code> in FHEM anlegen für CPU & RAM.
          </p>
        )}
      </section>
    );
  }

  return (
    <section
      aria-label="FHEM-Server Systemzustand"
      className="rounded-2xl border theme-surface p-4 sm:p-5 space-y-4"
    >
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl theme-tonal">
            <Server className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                FHEM-Server Zustand
              </h2>
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`}
                aria-hidden="true"
              />
            </div>
            <p
              className="truncate text-xs text-slate-500 dark:text-slate-400"
              title={metrics?.commandPreview ? `Abfrage: ${metrics.commandPreview}` : undefined}
            >
              {hostSubtitle}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void loadMetrics()}
            disabled={loading}
            title="System-Metriken per FHEM ReadingsVal aktualisieren"
            className="flex min-h-[36px] items-center gap-1.5 rounded-xl border theme-border px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-[var(--accent-ring)] disabled:opacity-50 dark:text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Aktualisieren</span>
          </button>

          {monitorDevice && (
            <button
              type="button"
              onClick={() => onOpenDetail(monitorDevice)}
              title={`${monitorDevice.alias} öffnen`}
              className="flex min-h-[36px] items-center gap-1.5 rounded-xl theme-surface-alt px-2.5 text-xs font-semibold text-slate-700 hover:opacity-85 dark:text-slate-200"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Details</span>
            </button>
          )}
        </div>
      </div>

      {/* 3-Column Metrics Grid: CPU, RAM, Uptime */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 1. CPU Load */}
        <div className="flex flex-col justify-between rounded-2xl border theme-border bg-[var(--m3-canvas)]/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Cpu className="h-3.5 w-3.5 theme-text shrink-0" />
              <span>CPU-Last</span>
            </div>
            {metrics?.cpu.cpuTempC !== null && metrics?.cpu.cpuTempC !== undefined && (
              <span className="flex items-center gap-1 font-mono text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                <Thermometer className="h-3 w-3 text-amber-500" />
                {metrics.cpu.cpuTempC.toFixed(1).replace('.', ',')} °C
              </span>
            )}
          </div>

          <div>
            <div
              className={`font-display text-2xl font-bold tabular-nums ${getMetricTextTone(
                cpuPercentForBar,
                65,
                85
              )}`}
            >
              {cpuPrimaryDisplay}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {loadAvgDisplay}
            </div>
          </div>

          {showVisuals && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${cpuPercentForBar !== null ? Math.max(4, Math.min(100, cpuPercentForBar)) : 0}%`,
                  backgroundColor: getMetricBarColor(cpuPercentForBar, 65, 85),
                }}
              />
            </div>
          )}
        </div>

        {/* 2. Memory Usage */}
        <div className="flex flex-col justify-between rounded-2xl border theme-border bg-[var(--m3-canvas)]/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <MemoryStick className="h-3.5 w-3.5 theme-text shrink-0" />
              <span>Speicherverbrauch</span>
            </div>
            {metrics?.memory.freeMb !== null && metrics?.memory.freeMb !== undefined && (
              <span className="font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
                Frei {formatMemoryAmount(metrics.memory.freeMb)}
              </span>
            )}
          </div>

          <div>
            <div
              className={`font-display text-2xl font-bold tabular-nums ${getMetricTextTone(
                ramPercent,
                70,
                85
              )}`}
            >
              {ramPrimaryDisplay}
            </div>
            <div className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {ramSecondaryDisplay}
            </div>
          </div>

          {showVisuals && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${ramPercent !== null ? Math.max(4, Math.min(100, ramPercent)) : 0}%`,
                  backgroundColor: getMetricBarColor(ramPercent, 70, 85),
                }}
              />
            </div>
          )}
        </div>

        {/* 3. Uptime */}
        <div className="flex flex-col justify-between rounded-2xl border theme-border bg-[var(--m3-canvas)]/70 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Clock className="h-3.5 w-3.5 theme-text shrink-0" />
              <span>Uptime</span>
            </div>
            <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              {isOnline ? 'Aktiv' : 'Offline'}
            </span>
          </div>

          <div>
            <div className="font-display text-lg sm:text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100 leading-snug">
              {metrics ? metrics.uptimeText || '—' : '…'}
            </div>
            <div className="mt-1 truncate font-mono text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {metrics?.fhemUptimeText && metrics.fhemUptimeText !== metrics.uptimeText
                ? `FHEM: ${metrics.fhemUptimeText}`
                : connectionStatus?.fhemVersion || 'FHEM-Dienst aktiv'}
            </div>
          </div>

          {showVisuals && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: isOnline && metrics?.uptimeText ? '100%' : '0%',
                  backgroundColor: isOnline ? '#10B981' : '#EF4444',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Helpful hint only if no SYSMON/SYSSTAT device exists on the connected FHEM server */}
      {metrics && !metrics.monitorDeviceName && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Hinweis: Für CPU-Last und RAM ein <code className="font-mono">SYSMON</code>-Gerät in FHEM definieren (z. B.{' '}
          <code className="font-mono">define FHEM_System SYSMON 1 1 1 10</code>).
        </p>
      )}
    </section>
  );
};
