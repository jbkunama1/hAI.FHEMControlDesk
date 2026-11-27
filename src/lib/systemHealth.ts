import type {CommandExecutionResult, FhemConnectionConfig, FhemDevice} from '../types/fhem';
import {isSafeFhemIdentifier} from './sensorHistory';

export interface ParsedCpuMetrics {
  load1: number | null;
  load5: number | null;
  load15: number | null;
  loadAvgRaw: string | null;
  usagePercent: number | null;
  cpuTempC: number | null;
}

export interface ParsedMemoryMetrics {
  usedMb: number | null;
  totalMb: number | null;
  freeMb: number | null;
  usedPercent: number | null;
  rawText: string | null;
}

export interface FhemSystemHealthMetrics {
  monitorDeviceName: string | null;
  monitorDeviceAlias: string | null;
  monitorDeviceType: string | null;
  hostModel: string | null;
  cpu: ParsedCpuMetrics;
  memory: ParsedMemoryMetrics;
  uptimeText: string | null;
  fhemUptimeText: string | null;
  source: 'readingsVal' | 'readings' | 'uptime_only' | 'unavailable';
  commandPreview?: string;
  latencyMs?: number;
  fetchedAt: number;
}

export type SystemCommandExecutor = (
  config: FhemConnectionConfig,
  cmd: string
) => Promise<CommandExecutionResult>;

/**
 * Finds the best FHEM server monitoring device (SYSMON, SYSSTAT, or a system device exposing loadavg/ram).
 */
export function detectSystemMonitorDevice(devices: FhemDevice[]): FhemDevice | null {
  const sysmon = devices.find((d) => d.type.toLowerCase() === 'sysmon');
  if (sysmon) return sysmon;

  const sysstat = devices.find((d) => d.type.toLowerCase() === 'sysstat');
  if (sysstat) return sysstat;

  const byReadings = devices.find(
    (d) =>
      'loadavg' in d.readings ||
      'stat_cpu_percent' in d.readings ||
      ('ram' in d.readings && ('uptime_text' in d.readings || 'uptime' in d.readings))
  );
  return byReadings || null;
}

/**
 * Builds a single safe FHEM Perl command using `ReadingsVal(...)` to fetch CPU, RAM, and Uptime metrics.
 * Validates the device name strictly to prevent command or Perl injection.
 */
export function buildSystemReadingsValCommand(deviceName: string): string | null {
  const trimmed = deviceName.trim();
  if (!isSafeFhemIdentifier(trimmed)) return null;

  // Single roundtrip FHEMWEB Perl expression returning key=value lines via ReadingsVal()
  const fields: Array<[string, string[]]> = [
    ['loadavg', ['loadavg', 'load']],
    ['cpu_percent', ['stat_cpu_percent', 'cpu_percent', 'cpu_usage', 'cpu_freq_percent']],
    ['cpu_temp', ['cpu_temp', 'cpu_temp_avg', 'cputemp']],
    ['ram', ['ram', 'mem_used', 'memory']],
    ['uptime', ['uptime_text', 'uptime', 'sys_uptime']],
    ['fhem_uptime', ['fhemuptime_text', 'fhemuptime']],
  ];

  const exprs = fields.map(([key, candidates]) => {
    // Nested ReadingsVal fallback chain in standard FHEM Perl syntax
    let chain = '""';
    for (let i = candidates.length - 1; i >= 0; i--) {
      chain = `ReadingsVal("${trimmed}","${candidates[i]}",${chain})`;
    }
    return `"${key}=".${chain}`;
  });

  return `{join("\\n", ${exprs.join(', ')})}`;
}

export function parseReadingsValKeyValueOutput(raw: string): Record<string, string> {
  const map: Record<string, string> = {};
  if (!raw || !raw.trim()) return map;

  for (const line of raw.split(/\r?\n/)) {
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    if (/^[a-z0-9_]+$/i.test(key) && val.length > 0) {
      map[key] = val;
    }
  }
  return map;
}

export function parseCpuMetrics(raw: {
  loadavg?: string;
  cpuPercent?: string;
  cpuTemp?: string;
}): ParsedCpuMetrics {
  let load1: number | null = null;
  let load5: number | null = null;
  let load15: number | null = null;
  const loadAvgRaw = raw.loadavg?.trim() || null;

  if (loadAvgRaw) {
    const nums = loadAvgRaw
      .replace(/,/g, '.')
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter((n) => Number.isFinite(n));
    if (nums && nums.length >= 1) load1 = nums[0];
    if (nums && nums.length >= 2) load5 = nums[1];
    if (nums && nums.length >= 3) load15 = nums[2];
  }

  let usagePercent: number | null = null;
  const cpuStr = raw.cpuPercent?.trim();
  if (cpuStr) {
    const nums = cpuStr
      .replace(/,/g, '.')
      .match(/\d+(?:\.\d+)?/g)
      ?.map(Number)
      .filter((n) => Number.isFinite(n));
    if (nums && nums.length >= 4) {
      // Standard FHEM SYSMON `stat_cpu_percent`: "user nice system idle [iowait irq softirq]"
      const idle = nums[3];
      usagePercent = Math.max(0, Math.min(100, Number((100 - idle).toFixed(1))));
    } else if (nums && nums.length >= 1) {
      usagePercent = Math.max(0, Math.min(100, Number(nums[0].toFixed(1))));
    }
  }

  let cpuTempC: number | null = null;
  const tempStr = raw.cpuTemp?.trim();
  if (tempStr) {
    const m = tempStr.replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/);
    if (m) {
      const n = Number(m[0]);
      if (Number.isFinite(n)) cpuTempC = Number(n.toFixed(1));
    }
  }

  return {
    load1,
    load5,
    load15,
    loadAvgRaw,
    usagePercent,
    cpuTempC,
  };
}

function toMb(value: number, unitRaw?: string): number {
  const unit = (unitRaw || 'mb').toLowerCase();
  if (unit === 'gb' || unit === 'gib') return value * 1024;
  if (unit === 'kb' || unit === 'kib') return value / 1024;
  return value;
}

export function parseMemoryMetrics(ramRaw?: string): ParsedMemoryMetrics {
  const rawText = ramRaw?.trim() || null;
  if (!rawText) {
    return {usedMb: null, totalMb: null, freeMb: null, usedPercent: null, rawText: null};
  }

  const normalized = rawText.replace(/,/g, '.');
  const totalMatch = normalized.match(/total\s*[:=]\s*(\d+(?:\.\d+)?)\s*(mb|gb|kb|mib|gib|kib)?/i);
  const usedMatch = normalized.match(/used\s*[:=]\s*(\d+(?:\.\d+)?)\s*(mb|gb|kb|mib|gib|kib)?/i);
  const freeMatch = normalized.match(/free\s*[:=]\s*(\d+(?:\.\d+)?)\s*(mb|gb|kb|mib|gib|kib)?/i);
  const pctMatch = normalized.match(/(\d+(?:\.\d+)?)\s*%/);

  const totalMb = totalMatch ? Math.round(toMb(Number(totalMatch[1]), totalMatch[2])) : null;
  let usedMb = usedMatch ? Math.round(toMb(Number(usedMatch[1]), usedMatch[2])) : null;
  let freeMb = freeMatch ? Math.round(toMb(Number(freeMatch[1]), freeMatch[2])) : null;

  if (usedMb === null && totalMb !== null && freeMb !== null) {
    usedMb = Math.max(0, totalMb - freeMb);
  }
  if (freeMb === null && totalMb !== null && usedMb !== null) {
    freeMb = Math.max(0, totalMb - usedMb);
  }

  let usedPercent: number | null = pctMatch ? Number(pctMatch[1]) : null;
  if (usedPercent === null && totalMb && totalMb > 0 && usedMb !== null) {
    usedPercent = Number(((usedMb / totalMb) * 100).toFixed(1));
  }
  if (usedPercent !== null) {
    usedPercent = Math.max(0, Math.min(100, Number(usedPercent.toFixed(1))));
  }

  return {usedMb, totalMb, freeMb, usedPercent, rawText};
}

export function formatUptimeText(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Numeric seconds (e.g. SYSMON `uptime` reading)
  if (/^\d+$/.test(trimmed)) {
    const totalSec = Number(trimmed);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} ${days === 1 ? 'Tag' : 'Tage'}`);
    if (hours > 0 || days > 0) parts.push(`${hours} Std`);
    parts.push(`${mins} Min`);
    return parts.join(', ');
  }

  // FHEM built-in `uptime` output: "42 days, 11:28:14" or "1 day, 03:12:05"
  const fhemBuiltIn = trimmed.match(/^(\d+)\s+days?,\s*(\d{1,2}):(\d{2})(?::\d{2})?$/i);
  if (fhemBuiltIn) {
    const days = Number(fhemBuiltIn[1]);
    const hours = Number(fhemBuiltIn[2]);
    const mins = Number(fhemBuiltIn[3]);
    return `${days} ${days === 1 ? 'Tag' : 'Tage'}, ${hours} Std, ${mins} Min`;
  }

  // Standard "HH:MM:SS"
  const hms = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hms) {
    return `${Number(hms[1])} Std, ${Number(hms[2])} Min`;
  }

  // Translate common English SYSMON labels into clean German
  return trimmed
    .replace(/\bdays\b/gi, 'Tage')
    .replace(/\bday\b/gi, 'Tag')
    .replace(/\bhours\b/gi, 'Std')
    .replace(/\bhour\b/gi, 'Std')
    .replace(/\bminutes\b/gi, 'Min')
    .replace(/\bminute\b/gi, 'Min');
}

export function formatMemoryAmount(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2).replace('.', ',')} GB`;
  }
  return `${Math.round(mb).toLocaleString('de-DE')} MB`;
}

/**
 * Fetches live FHEM server health metrics (CPU load, RAM usage, Uptime)
 * using FHEM `ReadingsVal(...)` on the detected SYSMON/SYSSTAT device,
 * with graceful fallback to native FHEM `uptime` and device readings.
 */
export async function fetchFhemSystemMetrics(params: {
  config: FhemConnectionConfig;
  devices: FhemDevice[];
  executeCmd: SystemCommandExecutor;
}): Promise<FhemSystemHealthMetrics> {
  const {config, devices, executeCmd} = params;
  const monitor = detectSystemMonitorDevice(devices);

  let rawMap: Record<string, string> = {};
  let source: FhemSystemHealthMetrics['source'] = 'unavailable';
  let commandPreview: string | undefined;
  let latencyMs: number | undefined;

  if (monitor) {
    const cmd = buildSystemReadingsValCommand(monitor.name);
    if (cmd) {
      commandPreview = cmd;
      const res = await executeCmd(config, cmd);
      latencyMs = res.latencyMs;
      if (res.ok && res.data.trim()) {
        const parsed = parseReadingsValKeyValueOutput(res.data);
        if (Object.keys(parsed).length > 0) {
          rawMap = parsed;
          source = 'readingsVal';
        }
      }
    }

    // Fallback to already-synced jsonlist2 readings on the monitor device if Perl evaluation was blocked
    if (source !== 'readingsVal') {
      const r = monitor.readings;
      const fallback: Record<string, string> = {};
      const pick = (...keys: string[]) => {
        for (const k of keys) {
          if (r[k]?.Value) return r[k].Value;
        }
        return '';
      };
      const loadavg = pick('loadavg', 'load');
      const cpuPercent = pick('stat_cpu_percent', 'cpu_percent', 'cpu_usage');
      const cpuTemp = pick('cpu_temp', 'cpu_temp_avg', 'cputemp');
      const ram = pick('ram', 'mem_used', 'memory');
      const uptime = pick('uptime_text', 'uptime', 'sys_uptime');
      const fhemUptime = pick('fhemuptime_text', 'fhemuptime');

      if (loadavg) fallback.loadavg = loadavg;
      if (cpuPercent) fallback.cpu_percent = cpuPercent;
      if (cpuTemp) fallback.cpu_temp = cpuTemp;
      if (ram) fallback.ram = ram;
      if (uptime) fallback.uptime = uptime;
      if (fhemUptime) fallback.fhem_uptime = fhemUptime;

      if (Object.keys(fallback).length > 0) {
        rawMap = fallback;
        source = 'readings';
      }
    }
  }

  // Always ensure Uptime is available via native FHEM `uptime` command if missing
  if (!rawMap.uptime) {
    const upRes = await executeCmd(config, 'uptime');
    latencyMs = latencyMs ?? upRes.latencyMs;
    if (upRes.ok && upRes.data.trim()) {
      const firstLine = upRes.data.trim().split(/\r?\n/)[0]?.trim();
      if (firstLine && !firstLine.toLowerCase().includes('unknown command')) {
        rawMap.uptime = firstLine;
        if (source === 'unavailable') {
          source = 'uptime_only';
          commandPreview = 'uptime';
        }
      }
    }
  }

  return {
    monitorDeviceName: monitor?.name || null,
    monitorDeviceAlias: monitor?.alias || null,
    monitorDeviceType: monitor?.type || null,
    hostModel: monitor?.model || monitor?.attributes.model || null,
    cpu: parseCpuMetrics({
      loadavg: rawMap.loadavg,
      cpuPercent: rawMap.cpu_percent,
      cpuTemp: rawMap.cpu_temp,
    }),
    memory: parseMemoryMetrics(rawMap.ram),
    uptimeText: formatUptimeText(rawMap.uptime),
    fhemUptimeText: formatUptimeText(rawMap.fhem_uptime),
    source,
    commandPreview,
    latencyMs,
    fetchedAt: Date.now(),
  };
}
