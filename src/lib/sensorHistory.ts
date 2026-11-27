import type {CommandExecutionResult, FhemConnectionConfig, FhemDevice} from '../types/fhem';

export type ChartTimeframe = '6h' | '24h' | '7d' | '30d';

export type FhemLogDeviceType = 'DbLog' | 'FileLog';
export type HistorySourceKind = 'dblog' | 'filelog' | 'simulated';
export type HistorySourcePreference = 'auto' | 'simulated' | 'manual' | `device:${string}`;

export interface FhemLogDeviceInfo {
  name: string;
  alias: string;
  type: FhemLogDeviceType;
  regexp: string;
  def: string;
  currentLogFile?: string;
}

export interface RawLogPoint {
  timestamp: number;
  value: number;
}

export interface HistoryFetchResult {
  points: ChartDataPoint[];
  stats: SeriesStats | null;
  source: HistorySourceKind;
  logDeviceName?: string;
  logDeviceType?: FhemLogDeviceType;
  rawPointCount: number;
  downsampled: boolean;
  commandUsed?: string;
  notice?: string;
  errorMessage?: string;
  latencyMs?: number;
  fetchedAt: number;
}

export interface ReadingMetricMeta {
  key: string;
  label: string;
  shortLabel: string;
  unit: string;
  color: string;
  decimals: number;
  category: 'climate' | 'energy' | 'zigbee' | 'control' | 'other';
  minBound?: number;
  maxBound?: number;
}

export interface SensorReadingOption extends ReadingMetricMeta {
  currentValue: number;
  formattedValue: string;
  timestamp: string;
}

export interface ChartDataPoint {
  time: string;
  fullTime: string;
  timestamp: number;
  value: number;
  secondaryValue?: number;
  compareValue?: number;
}

export interface SeriesStats {
  current: number;
  avg: number;
  min: number;
  max: number;
  delta: number;
}

const KNOWN_READINGS: Record<string, Omit<ReadingMetricMeta, 'key'>> = {
  temperature: {
    label: 'Temperatur',
    shortLabel: 'Temp.',
    unit: '°C',
    color: '#F97316',
    decimals: 1,
    category: 'climate',
  },
  'measured-temp': {
    label: 'Ist-Temperatur',
    shortLabel: 'Ist-Temp.',
    unit: '°C',
    color: '#F97316',
    decimals: 1,
    category: 'climate',
  },
  'desired-temp': {
    label: 'Soll-Temperatur',
    shortLabel: 'Soll-Temp.',
    unit: '°C',
    color: '#EF4444',
    decimals: 1,
    category: 'climate',
  },
  humidity: {
    label: 'Luftfeuchtigkeit',
    shortLabel: 'Feuchte',
    unit: '% rF',
    color: '#0EA5E9',
    decimals: 0,
    category: 'climate',
    minBound: 0,
    maxBound: 100,
  },
  pressure: {
    label: 'Luftdruck',
    shortLabel: 'Druck',
    unit: 'hPa',
    color: '#8B5CF6',
    decimals: 1,
    category: 'climate',
  },
  power: {
    label: 'Leistung',
    shortLabel: 'Leistung',
    unit: 'W',
    color: '#EAB308',
    decimals: 1,
    category: 'energy',
    minBound: 0,
  },
  energy: {
    label: 'Energieverbrauch',
    shortLabel: 'Energie',
    unit: 'kWh',
    color: '#10B981',
    decimals: 2,
    category: 'energy',
    minBound: 0,
  },
  valve: {
    label: 'Ventilöffnung',
    shortLabel: 'Ventil',
    unit: '%',
    color: '#EC4899',
    decimals: 0,
    category: 'climate',
    minBound: 0,
    maxBound: 100,
  },
  pct: {
    label: 'Helligkeit / Position',
    shortLabel: 'Prozent',
    unit: '%',
    color: '#3B82F6',
    decimals: 0,
    category: 'control',
    minBound: 0,
    maxBound: 100,
  },
  ct: {
    label: 'Farbtemperatur',
    shortLabel: 'Kelvin',
    unit: 'K',
    color: '#F59E0B',
    decimals: 0,
    category: 'control',
    minBound: 2000,
    maxBound: 6500,
  },
  illuminance: {
    label: 'Beleuchtungsstärke',
    shortLabel: 'Lux',
    unit: 'lx',
    color: '#F59E0B',
    decimals: 0,
    category: 'climate',
    minBound: 0,
  },
  lux: {
    label: 'Beleuchtungsstärke',
    shortLabel: 'Lux',
    unit: 'lx',
    color: '#F59E0B',
    decimals: 0,
    category: 'climate',
    minBound: 0,
  },
  co2: {
    label: 'CO₂-Konzentration',
    shortLabel: 'CO₂',
    unit: 'ppm',
    color: '#14B8A6',
    decimals: 0,
    category: 'climate',
    minBound: 350,
  },
  batteryPercent: {
    label: 'Batteriestand',
    shortLabel: 'Batterie',
    unit: '%',
    color: '#22C55E',
    decimals: 0,
    category: 'zigbee',
    minBound: 0,
    maxBound: 100,
  },
  battery: {
    label: 'Batteriestand',
    shortLabel: 'Batterie',
    unit: '%',
    color: '#22C55E',
    decimals: 0,
    category: 'zigbee',
    minBound: 0,
    maxBound: 100,
  },
  linkquality: {
    label: 'ZigBee LQI',
    shortLabel: 'LQI',
    unit: 'LQI',
    color: '#6366F1',
    decimals: 0,
    category: 'zigbee',
    minBound: 0,
    maxBound: 255,
  },
  rssi: {
    label: 'Signalstärke (RSSI)',
    shortLabel: 'RSSI',
    unit: 'dBm',
    color: '#6366F1',
    decimals: 0,
    category: 'zigbee',
  },
};

const READING_PRIORITY: Record<string, number> = {
  temperature: 1,
  'measured-temp': 2,
  humidity: 3,
  pressure: 4,
  co2: 5,
  illuminance: 6,
  lux: 7,
  power: 8,
  energy: 9,
  'desired-temp': 10,
  valve: 11,
  pct: 12,
  ct: 13,
  batteryPercent: 20,
  battery: 21,
  linkquality: 22,
  rssi: 23,
};

const IGNORED_READING_KEYS = new Set([
  'state',
  'bri',
  'level',
  'reachable',
  'cmd',
  'cmd_nr',
  'cmd_event',
  'error',
  'timer_01_c01',
]);

export function parseNumericReadingValue(raw: string): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  // Match leading signed decimal number (e.g. "21.4", "-64 dBm", "48 %", "1014.2 hPa")
  const match = trimmed.match(/^(-?\d+(?:[.,]\d+)?)(?:\s*(?:°?C|%|rF|hPa|W|kWh|K|lx|ppm|dBm|LQI|V|mV))?$/i);
  if (!match) return null;
  const parsed = Number(match[1].replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export function getReadingMeta(key: string): ReadingMetricMeta {
  const known = KNOWN_READINGS[key];
  if (known) {
    return {key, ...known};
  }
  const lower = key.toLowerCase();
  if (lower.includes('temp')) {
    return {key, label: key, shortLabel: key, unit: '°C', color: '#F97316', decimals: 1, category: 'climate'};
  }
  if (lower.includes('hum')) {
    return {key, label: key, shortLabel: key, unit: '% rF', color: '#0EA5E9', decimals: 0, category: 'climate', minBound: 0, maxBound: 100};
  }
  if (lower.includes('watt') || lower.includes('power')) {
    return {key, label: key, shortLabel: key, unit: 'W', color: '#EAB308', decimals: 1, category: 'energy', minBound: 0};
  }
  if (lower.includes('bat')) {
    return {key, label: key, shortLabel: key, unit: '%', color: '#22C55E', decimals: 0, category: 'zigbee', minBound: 0, maxBound: 100};
  }
  return {
    key,
    label: key,
    shortLabel: key,
    unit: '',
    color: '#3B82F6',
    decimals: 1,
    category: 'other',
  };
}

export function formatReadingMetric(value: number, meta: Pick<ReadingMetricMeta, 'decimals' | 'unit'>): string {
  const num = value.toFixed(meta.decimals);
  return meta.unit ? `${num} ${meta.unit}` : num;
}

export function extractChartableReadings(device: FhemDevice): SensorReadingOption[] {
  const options: SensorReadingOption[] = [];
  const hasTemperature = device.readings.temperature !== undefined;

  for (const [key, reading] of Object.entries(device.readings)) {
    if (IGNORED_READING_KEYS.has(key)) continue;
    // Avoid duplicating measured-temp when identical temperature reading exists
    if (key === 'measured-temp' && hasTemperature) continue;

    const num = parseNumericReadingValue(reading.Value);
    if (num === null) continue;

    const meta = getReadingMeta(key);
    options.push({
      ...meta,
      currentValue: num,
      formattedValue: formatReadingMetric(num, meta),
      timestamp: reading.Time,
    });
  }

  options.sort((a, b) => {
    const pa = READING_PRIORITY[a.key] ?? 50;
    const pb = READING_PRIORITY[b.key] ?? 50;
    if (pa !== pb) return pa - pb;
    return a.label.localeCompare(b.label, 'de');
  });

  return options;
}

export function isDeviceChartable(device: FhemDevice): boolean {
  return extractChartableReadings(device).length > 0;
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function formatAxisTime(d: Date, timeframe: ChartTimeframe): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  if (timeframe === '6h' || timeframe === '24h') {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (timeframe === '7d') {
    const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][d.getDay()];
    return `${wd} ${pad(d.getHours())}h`;
  }
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

function formatFullTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())} Uhr`;
}

function synthesizeReadingValue(
  key: string,
  currentVal: number,
  stepIndexFromEnd: number,
  totalSteps: number,
  date: Date,
  seed: number,
  meta: ReadingMetricMeta
): number {
  if (stepIndexFromEnd === 0) return currentVal;

  const hour = date.getHours() + date.getMinutes() / 60;
  // Realistic diurnal phase: coolest ~05:00, warmest ~15:30
  const diurnal = Math.sin(((hour - 9) / 24) * Math.PI * 2);
  const slowTrend = Math.sin((stepIndexFromEnd / Math.max(1, totalSteps)) * Math.PI * 2.5 + (seed % 17));
  const pseudoNoise = (((seed + stepIndexFromEnd * 7919) % 1000) / 1000 - 0.5) * 2;

  let val = currentVal;
  const lower = key.toLowerCase();

  if (lower.includes('desired')) {
    // Thermostat setpoints step cleanly by 0.5 °C during night setback (22:30 - 06:00)
    const isNight = hour >= 22.5 || hour < 6;
    val = isNight ? Math.max(16, currentVal - 2.5) : currentVal;
    val = Math.round(val * 2) / 2;
  } else if (lower.includes('temp')) {
    const isOutdoor = currentVal < 15;
    const amp = isOutdoor ? 3.2 : 1.1;
    val = currentVal + diurnal * amp + slowTrend * (amp * 0.35) + pseudoNoise * 0.25;
  } else if (lower.includes('hum')) {
    // Humidity inversely correlates with temperature
    val = currentVal - diurnal * 5.5 + slowTrend * 3.2 + pseudoNoise * 1.8;
  } else if (lower.includes('pressure')) {
    val = currentVal + slowTrend * 5.2 + pseudoNoise * 0.7;
  } else if (lower.includes('power')) {
    const activeDay = hour >= 7 && hour <= 22;
    const factor = activeDay ? 0.8 + (diurnal + 1) * 0.28 : 0.22;
    val = Math.max(0, currentVal * factor + pseudoNoise * Math.max(4, currentVal * 0.12));
  } else if (lower.includes('energy')) {
    // Monotonically rising energy counter ending at currentVal
    const frac = stepIndexFromEnd / Math.max(1, totalSteps);
    val = Math.max(0, currentVal * (1 - frac * 0.28));
  } else if (lower === 'valve') {
    val = Math.max(0, Math.min(100, currentVal - diurnal * 18 + pseudoNoise * 6));
  } else if (lower.includes('bat')) {
    // Batteries drain very slowly over days
    const drain = (stepIndexFromEnd / Math.max(1, totalSteps)) * 2.2;
    val = Math.min(100, currentVal + drain);
  } else if (lower === 'linkquality' || lower === 'rssi') {
    val = currentVal + pseudoNoise * 5 + slowTrend * 2;
  } else if (lower === 'pct') {
    const evening = hour >= 18 || hour <= 7;
    val = evening ? currentVal + slowTrend * 18 + pseudoNoise * 6 : Math.max(0, currentVal * 0.25);
  } else if (lower === 'co2') {
    const occupied = hour >= 17 && hour <= 23;
    val = currentVal + (occupied ? 120 : -90) + pseudoNoise * 35;
  } else {
    val = currentVal + slowTrend * (Math.abs(currentVal) * 0.08 + 1) + pseudoNoise * 0.5;
  }

  if (meta.minBound !== undefined) val = Math.max(meta.minBound, val);
  if (meta.maxBound !== undefined) val = Math.min(meta.maxBound, val);

  return Number(val.toFixed(meta.decimals));
}

export function buildSensorHistorySeries(params: {
  device: FhemDevice;
  readingKey: string;
  timeframe: ChartTimeframe;
  secondaryReadingKey?: string | null;
  compareDevice?: FhemDevice | null;
}): ChartDataPoint[] {
  const {device, readingKey, timeframe, secondaryReadingKey, compareDevice} = params;
  const primaryReading = device.readings[readingKey];
  const primaryCurrent = primaryReading ? parseNumericReadingValue(primaryReading.Value) : null;
  if (primaryCurrent === null) return [];

  const primaryMeta = getReadingMeta(readingKey);
  const secondaryRaw = secondaryReadingKey ? device.readings[secondaryReadingKey] : undefined;
  const secondaryCurrent = secondaryRaw ? parseNumericReadingValue(secondaryRaw.Value) : null;
  const secondaryMeta = secondaryReadingKey ? getReadingMeta(secondaryReadingKey) : null;

  const compareRaw = compareDevice ? compareDevice.readings[readingKey] : undefined;
  const compareCurrent = compareRaw ? parseNumericReadingValue(compareRaw.Value) : null;

  const stepConfig: Record<ChartTimeframe, {count: number; stepMs: number}> = {
    '6h': {count: 25, stepMs: 15 * 60_000},
    '24h': {count: 25, stepMs: 60 * 60_000},
    '7d': {count: 29, stepMs: 6 * 60 * 60_000},
    '30d': {count: 31, stepMs: 24 * 60 * 60_000},
  };

  const {count, stepMs} = stepConfig[timeframe];
  const now = Date.now();
  const primarySeed = hashSeed(`${device.name}:${readingKey}`);
  const secondarySeed = secondaryReadingKey ? hashSeed(`${device.name}:${secondaryReadingKey}`) : 0;
  const compareSeed = compareDevice ? hashSeed(`${compareDevice.name}:${readingKey}`) : 0;

  const points: ChartDataPoint[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const ts = now - i * stepMs;
    const date = new Date(ts);

    const value = synthesizeReadingValue(
      readingKey,
      primaryCurrent,
      i,
      count - 1,
      date,
      primarySeed,
      primaryMeta
    );

    const pt: ChartDataPoint = {
      time: formatAxisTime(date, timeframe),
      fullTime: formatFullTimestamp(date),
      timestamp: ts,
      value,
    };

    if (secondaryReadingKey && secondaryCurrent !== null && secondaryMeta) {
      pt.secondaryValue = synthesizeReadingValue(
        secondaryReadingKey,
        secondaryCurrent,
        i,
        count - 1,
        date,
        secondarySeed,
        secondaryMeta
      );
    }

    if (compareDevice && compareCurrent !== null) {
      pt.compareValue = synthesizeReadingValue(
        readingKey,
        compareCurrent,
        i,
        count - 1,
        date,
        compareSeed,
        primaryMeta
      );
    }

    points.push(pt);
  }

  return points;
}

export function computeSeriesStats(points: ChartDataPoint[]): SeriesStats | null {
  if (points.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const p of points) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
    sum += p.value;
  }
  const current = points[points.length - 1].value;
  const first = points[0].value;
  return {
    current,
    avg: sum / points.length,
    min,
    max,
    delta: current - first,
  };
}

// ============================================================================
// Real FHEM DbLog & FileLog History Engine
// ============================================================================

const SAFE_FHEM_IDENTIFIER_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function isSafeFhemIdentifier(value: string): boolean {
  return SAFE_FHEM_IDENTIFIER_RE.test(value.trim());
}

export function formatFhemLogTimestamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseFhemLogTimestamp(raw: string): number | null {
  const m = raw.trim().match(/^(\d{4})-(\d{2})-(\d{2})[_T ](\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const d = new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  );
  const ts = d.getTime();
  return Number.isFinite(ts) ? ts : null;
}

export function getTimeframeDurationMs(timeframe: ChartTimeframe): number {
  switch (timeframe) {
    case '6h':
      return 6 * 3600_000;
    case '24h':
      return 24 * 3600_000;
    case '7d':
      return 7 * 24 * 3600_000;
    case '30d':
      return 30 * 24 * 3600_000;
  }
}

function getMergeToleranceMs(timeframe: ChartTimeframe): number {
  switch (timeframe) {
    case '6h':
      return 30 * 60_000;
    case '24h':
      return 90 * 60_000;
    case '7d':
      return 6 * 3600_000;
    case '30d':
      return 24 * 3600_000;
  }
}

function extractRegexpFromDef(def: string): string {
  const trimmed = def.trim();
  if (!trimmed) return '';
  const spaceIdx = trimmed.search(/\s+/);
  if (spaceIdx === -1) return '';
  return trimmed.slice(spaceIdx).trim();
}

export function discoverFhemLogDevices(devices: FhemDevice[]): FhemLogDeviceInfo[] {
  const result: FhemLogDeviceInfo[] = [];

  for (const d of devices) {
    const lowerType = d.type.toLowerCase();
    if (lowerType !== 'dblog' && lowerType !== 'filelog') continue;

    // Skip FHEM's main system logfile ("Logfile" / fakelog)
    const regexp = (d.internals.REGEXP || extractRegexpFromDef(d.def) || '').trim();
    if (lowerType === 'filelog' && (d.name.toLowerCase() === 'logfile' || regexp.toLowerCase() === 'fakelog')) {
      continue;
    }

    result.push({
      name: d.name,
      alias: d.alias || d.name,
      type: lowerType === 'dblog' ? 'DbLog' : 'FileLog',
      regexp,
      def: d.def,
      currentLogFile: d.internals.currentlogfile || undefined,
    });
  }

  // Sort DbLog devices first, then FileLog devices alphabetically
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'DbLog' ? -1 : 1;
    return a.name.localeCompare(b.name, 'de');
  });

  return result;
}

function compileSafeUserRegexp(pattern: string): RegExp | null {
  const cleaned = pattern.trim();
  if (!cleaned || cleaned.length > 240) return null;
  // Guard against catastrophic backtracking patterns in user regexes
  if (/(\+|\*|\{[^}]*\})\s*\)\s*(\+|\*|\{)/.test(cleaned)) return null;
  try {
    return new RegExp(cleaned);
  } catch {
    return null;
  }
}

export function scoreFileLogMatch(
  logDevice: FhemLogDeviceInfo,
  deviceName: string,
  readingKey?: string
): number {
  if (logDevice.type !== 'FileLog') return 0;
  const rxStr = logDevice.regexp.trim();
  const nameBonus = logDevice.name.toLowerCase().includes(deviceName.toLowerCase()) ? 15 : 0;

  if (!rxStr) return nameBonus;

  // Quick exact-prefix checks common in FHEM ("Temp_WZ:.*", "Temp_WZ:temperature.*")
  if (
    rxStr === deviceName ||
    rxStr.startsWith(`${deviceName}:`) ||
    rxStr.startsWith(`^${deviceName}:`)
  ) {
    return 100 + nameBonus;
  }

  const rx = compileSafeUserRegexp(rxStr);
  if (!rx) {
    return rxStr.toLowerCase().includes(deviceName.toLowerCase()) ? 60 + nameBonus : nameBonus;
  }

  const sampleReading = readingKey ? `${deviceName}:${readingKey}` : `${deviceName}:temperature`;
  const sampleState = `${deviceName}:state`;
  const matchesTarget = rx.test(sampleReading) || rx.test(sampleState) || rx.test(deviceName);
  if (!matchesTarget) return 0;

  // Distinguish specific/grouped FileLogs from catch-all ".*:.*" FileLogs
  const matchesUnrelated = rx.test('__UNRELATED_FHEM_DEV_999__:__foo__');
  if (!matchesUnrelated) {
    return 80 + nameBonus;
  }
  return 25 + nameBonus;
}

export function matchFileLogsForDevice(
  logDevices: FhemLogDeviceInfo[],
  deviceName: string,
  readingKey?: string
): FhemLogDeviceInfo[] {
  return logDevices
    .filter((d) => d.type === 'FileLog')
    .map((d) => ({device: d, score: scoreFileLogMatch(d, deviceName, readingKey)}))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.device.name.localeCompare(b.device.name, 'de'))
    .map((x) => x.device);
}

function escapeFhemFileLogRegexToken(token: string): string {
  // Token is already restricted to [A-Za-z0-9._-]; escape '.' so FileLog regex matches literally
  return token.replace(/\./g, '\\.');
}

export function buildDbLogGetCommand(params: {
  logDeviceName: string;
  deviceName: string;
  readingKey: string;
  from: Date;
  to: Date;
}): string | null {
  const {logDeviceName, deviceName, readingKey, from, to} = params;
  if (
    !isSafeFhemIdentifier(logDeviceName) ||
    !isSafeFhemIdentifier(deviceName) ||
    !isSafeFhemIdentifier(readingKey)
  ) {
    return null;
  }
  return `get ${logDeviceName.trim()} - - ${formatFhemLogTimestamp(from)} ${formatFhemLogTimestamp(to)} ${deviceName.trim()}:${readingKey.trim()}`;
}

export function buildFileLogGetCommands(params: {
  logDeviceName: string;
  deviceName: string;
  readingKey: string;
  from: Date;
  to: Date;
  isDedicatedFileLog?: boolean;
}): string[] {
  const {logDeviceName, deviceName, readingKey, from, to, isDedicatedFileLog} = params;
  if (
    !isSafeFhemIdentifier(logDeviceName) ||
    !isSafeFhemIdentifier(deviceName) ||
    !isSafeFhemIdentifier(readingKey)
  ) {
    return [];
  }

  const logName = logDeviceName.trim();
  const devEsc = escapeFhemFileLogRegexToken(deviceName.trim());
  const readEsc = escapeFhemFileLogRegexToken(readingKey.trim());
  const fromStr = formatFhemLogTimestamp(from);
  const toStr = formatFhemLogTimestamp(to);

  // Official FHEM 92_FileLog.pm syntax (identical to .gplot specs):
  // 1) Standard reading lines: "2026-11-26_14:30:12 DevName temperature: 21.4"
  const specs: string[] = [`4:${devEsc}.${readEsc}\\x3a::`];

  // 2) Classic combined state lines ("2026-11-26_14:30:12 DevName T: 21.4 H: 48")
  if (readingKey === 'temperature' || readingKey === 'measured-temp') {
    specs.push(`4:${devEsc}.T\\x3a::`);
  } else if (readingKey === 'humidity') {
    specs.push(`6:${devEsc}.T\\x3a.*H\\x3a::`);
  }

  // 3) Dedicated single-device FileLog fallback without device-name prefix
  if (isDedicatedFileLog) {
    specs.push(`4:${readEsc}\\x3a::`);
  }

  return specs.map((spec) => `get ${logName} - - ${fromStr} ${toStr} ${spec}`);
}

export function parseFhemLogOutput(rawText: string): RawLogPoint[] {
  if (!rawText || !rawText.trim()) return [];
  const points: RawLogPoint[] = [];
  const lines = rawText.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    // Matches both DbLog & FileLog output rows: "2026-11-26_14:30:12 21.4" (or "21,4 °C")
    const m = line.match(
      /^(\d{4})-(\d{2})-(\d{2})[_T ](\d{2}):(\d{2}):(\d{2})\s+(-?\d+(?:[.,]\d+)?)/
    );
    if (!m) continue;

    const val = Number(m[7].replace(',', '.'));
    if (!Number.isFinite(val)) continue;

    const ts = new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5]),
      Number(m[6])
    ).getTime();

    if (!Number.isFinite(ts)) continue;
    points.push({timestamp: ts, value: val});
  }

  if (points.length <= 1) return points;

  points.sort((a, b) => a.timestamp - b.timestamp);

  // Deduplicate identical timestamps (keep latest entry)
  const deduped: RawLogPoint[] = [];
  for (const pt of points) {
    if (deduped.length > 0 && deduped[deduped.length - 1].timestamp === pt.timestamp) {
      deduped[deduped.length - 1] = pt;
    } else {
      deduped.push(pt);
    }
  }

  return deduped;
}

export function downsampleRawPoints(points: RawLogPoint[], maxPoints = 180): RawLogPoint[] {
  if (points.length <= maxPoints) return points;
  if (maxPoints < 3) return [points[0], points[points.length - 1]];

  const interior = points.slice(1, -1);
  const bucketCount = maxPoints - 2;
  const bucketSize = interior.length / bucketCount;
  const result: RawLogPoint[] = [points[0]];

  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * bucketSize);
    const end = Math.min(interior.length, Math.floor((b + 1) * bucketSize));
    if (start >= end) continue;

    let sumVal = 0;
    let sumTs = 0;
    const count = end - start;
    for (let i = start; i < end; i++) {
      sumVal += interior[i].value;
      sumTs += interior[i].timestamp;
    }
    result.push({
      timestamp: Math.round(sumTs / count),
      value: sumVal / count,
    });
  }

  result.push(points[points.length - 1]);
  return result;
}

function findNearestRawPoint(
  sortedPoints: RawLogPoint[],
  targetTs: number,
  toleranceMs: number
): number | undefined {
  if (sortedPoints.length === 0) return undefined;
  let lo = 0;
  let hi = sortedPoints.length - 1;

  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedPoints[mid].timestamp < targetTs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  let bestIdx = lo;
  if (lo > 0) {
    const diffLo = Math.abs(sortedPoints[lo].timestamp - targetTs);
    const diffPrev = Math.abs(sortedPoints[lo - 1].timestamp - targetTs);
    if (diffPrev < diffLo) bestIdx = lo - 1;
  }

  const best = sortedPoints[bestIdx];
  return Math.abs(best.timestamp - targetTs) <= toleranceMs ? best.value : undefined;
}

function computeRawStats(rawPoints: RawLogPoint[]): SeriesStats | null {
  if (rawPoints.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (const p of rawPoints) {
    if (p.value < min) min = p.value;
    if (p.value > max) max = p.value;
    sum += p.value;
  }
  const current = rawPoints[rawPoints.length - 1].value;
  const first = rawPoints[0].value;
  return {
    current,
    avg: sum / rawPoints.length,
    min,
    max,
    delta: current - first,
  };
}

// ============================================================================
// Client-Side TTL Cache (60 seconds)
// ============================================================================

const HISTORY_CACHE_TTL_MS = 60_000;
const historyCache = new Map<string, {expiresAt: number; result: HistoryFetchResult}>();

export function clearHistoryCache(): void {
  historyCache.clear();
}

export type FhemCommandExecutor = (
  config: FhemConnectionConfig,
  cmd: string
) => Promise<CommandExecutionResult>;

async function querySingleSeriesFromLogDevice(params: {
  config: FhemConnectionConfig;
  logDevice: FhemLogDeviceInfo;
  deviceName: string;
  readingKey: string;
  from: Date;
  to: Date;
  executeCmd: FhemCommandExecutor;
}): Promise<{
  ok: boolean;
  points: RawLogPoint[];
  commandUsed?: string;
  latencyMs?: number;
  errorMessage?: string;
}> {
  const {config, logDevice, deviceName, readingKey, from, to, executeCmd} = params;

  if (logDevice.type === 'DbLog') {
    const cmd = buildDbLogGetCommand({
      logDeviceName: logDevice.name,
      deviceName,
      readingKey,
      from,
      to,
    });
    if (!cmd) {
      return {ok: false, points: [], errorMessage: 'Ungültiger Geräte- oder Reading-Name für DbLog.'};
    }
    const res = await executeCmd(config, cmd);
    if (!res.ok) {
      return {
        ok: false,
        points: [],
        commandUsed: cmd,
        latencyMs: res.latencyMs,
        errorMessage: res.errorMessage || 'DbLog-Abfrage fehlgeschlagen.',
      };
    }
    return {
      ok: true,
      points: parseFhemLogOutput(res.data),
      commandUsed: cmd,
      latencyMs: res.latencyMs,
    };
  }

  // FileLog: try official colspec + classic T:/H: fallbacks until points are found
  const isDedicated = scoreFileLogMatch(logDevice, deviceName, readingKey) >= 100;
  const cmds = buildFileLogGetCommands({
    logDeviceName: logDevice.name,
    deviceName,
    readingKey,
    from,
    to,
    isDedicatedFileLog: isDedicated,
  });

  if (cmds.length === 0) {
    return {ok: false, points: [], errorMessage: 'Ungültiger Geräte- oder Reading-Name für FileLog.'};
  }

  let lastCmd = cmds[0];
  let lastLatency: number | undefined;
  let lastError: string | undefined;

  for (const cmd of cmds) {
    lastCmd = cmd;
    const res = await executeCmd(config, cmd);
    lastLatency = res.latencyMs;
    if (!res.ok) {
      lastError = res.errorMessage || 'FileLog-Abfrage fehlgeschlagen.';
      break;
    }
    const pts = parseFhemLogOutput(res.data);
    if (pts.length > 0) {
      return {
        ok: true,
        points: pts,
        commandUsed: cmd,
        latencyMs: res.latencyMs,
      };
    }
  }

  return {
    ok: !lastError,
    points: [],
    commandUsed: lastCmd,
    latencyMs: lastLatency,
    errorMessage: lastError,
  };
}

function buildSimulatedResult(params: {
  device: FhemDevice;
  readingKey: string;
  timeframe: ChartTimeframe;
  secondaryReadingKey?: string | null;
  compareDevice?: FhemDevice | null;
  notice?: string;
  errorMessage?: string;
  commandUsed?: string;
}): HistoryFetchResult {
  const points = buildSensorHistorySeries({
    device: params.device,
    readingKey: params.readingKey,
    timeframe: params.timeframe,
    secondaryReadingKey: params.secondaryReadingKey,
    compareDevice: params.compareDevice,
  });
  return {
    points,
    stats: computeSeriesStats(points),
    source: 'simulated',
    rawPointCount: points.length,
    downsampled: false,
    commandUsed: params.commandUsed,
    notice: params.notice,
    errorMessage: params.errorMessage,
    fetchedAt: Date.now(),
  };
}

export async function fetchFhemSensorHistory(params: {
  config: FhemConnectionConfig;
  logDevices: FhemLogDeviceInfo[];
  device: FhemDevice;
  readingKey: string;
  timeframe: ChartTimeframe;
  secondaryReadingKey?: string | null;
  compareDevice?: FhemDevice | null;
  sourcePreference?: HistorySourcePreference;
  manualLogDevice?: {name: string; type: FhemLogDeviceType} | null;
  forceRefresh?: boolean;
  executeCmd: FhemCommandExecutor;
}): Promise<HistoryFetchResult> {
  const {
    config,
    logDevices,
    device,
    readingKey,
    timeframe,
    secondaryReadingKey,
    compareDevice,
    sourcePreference = 'auto',
    manualLogDevice = null,
    forceRefresh = false,
    executeCmd,
  } = params;

  if (sourcePreference === 'simulated') {
    return buildSimulatedResult({
      device,
      readingKey,
      timeframe,
      secondaryReadingKey,
      compareDevice,
      notice: 'Lokale Vorschau manuell gewählt.',
    });
  }

  const manualKey =
    sourcePreference === 'manual' && manualLogDevice
      ? `${manualLogDevice.type}:${manualLogDevice.name.trim()}`
      : '';
  const cacheKey = [
    config.mode,
    config.host,
    config.port,
    config.transport,
    device.name,
    readingKey,
    timeframe,
    secondaryReadingKey || '',
    compareDevice?.name || '',
    sourcePreference,
    manualKey,
  ].join('|');

  if (!forceRefresh) {
    const cached = historyCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }
  }

  // Build ordered candidate list of log devices to query
  let candidates: FhemLogDeviceInfo[] = [];

  if (sourcePreference === 'manual') {
    const trimmedName = manualLogDevice?.name.trim() || '';
    if (!trimmedName || !isSafeFhemIdentifier(trimmedName)) {
      return buildSimulatedResult({
        device,
        readingKey,
        timeframe,
        secondaryReadingKey,
        compareDevice,
        notice: 'Bitte gültigen FHEM Log-Gerätenamen (z. B. logdb oder FileLog_Klima) eingeben.',
      });
    }
    candidates = [
      {
        name: trimmedName,
        alias: trimmedName,
        type: manualLogDevice?.type || 'DbLog',
        regexp: '',
        def: '',
      },
    ];
  } else if (sourcePreference.startsWith('device:')) {
    const chosenName = sourcePreference.slice('device:'.length);
    const found = logDevices.find((d) => d.name === chosenName);
    if (found) {
      candidates = [found];
    }
  } else {
    // Auto mode: prefer DbLog devices first, then matching FileLog devices (best REGEXP match first)
    const dbLogs = logDevices.filter((d) => d.type === 'DbLog');
    const matchedFileLogs = matchFileLogsForDevice(logDevices, device.name, readingKey);
    candidates = [...dbLogs, ...matchedFileLogs];
  }

  if (candidates.length === 0) {
    const res = buildSimulatedResult({
      device,
      readingKey,
      timeframe,
      secondaryReadingKey,
      compareDevice,
      notice:
        logDevices.length === 0
          ? 'Kein DbLog- oder FileLog-Gerät in FHEM erkannt — Vorschau aktiv.'
          : `Kein passendes DbLog/FileLog für ${device.name} erkannt — Vorschau aktiv.`,
    });
    return res;
  }

  const now = Date.now();
  const from = new Date(now - getTimeframeDurationMs(timeframe));
  const to = new Date(now + 60_000);

  let chosenLog: FhemLogDeviceInfo | null = null;
  let primaryRaw: RawLogPoint[] = [];
  let commandUsed: string | undefined;
  let latencyMs: number | undefined;
  let lastError: string | undefined;

  for (const candidate of candidates) {
    const attempt = await querySingleSeriesFromLogDevice({
      config,
      logDevice: candidate,
      deviceName: device.name,
      readingKey,
      from,
      to,
      executeCmd,
    });
    commandUsed = attempt.commandUsed;
    latencyMs = attempt.latencyMs;
    if (!attempt.ok) {
      lastError = attempt.errorMessage;
      continue;
    }
    if (attempt.points.length > 0) {
      chosenLog = candidate;
      primaryRaw = attempt.points;
      break;
    }
  }

  if (!chosenLog || primaryRaw.length === 0) {
    const triedNames = candidates.map((c) => c.name).slice(0, 3).join(', ');
    return buildSimulatedResult({
      device,
      readingKey,
      timeframe,
      secondaryReadingKey,
      compareDevice,
      commandUsed,
      errorMessage: lastError,
      notice: lastError
        ? `FHEM-Log-Abfrage fehlgeschlagen (${lastError}) — Vorschau aktiv.`
        : `Keine Einträge für ${device.name}:${readingKey} in ${triedNames} im gewählten Zeitraum — Vorschau aktiv.`,
    });
  }

  // Fetch optional secondary reading (humidity) and comparison device in parallel
  const fetchOptionalSeries = async (
    targetDeviceName: string,
    targetReadingKey: string
  ): Promise<RawLogPoint[]> => {
    // First try the same log device (always works for DbLog and grouped FileLogs)
    const primaryTry = await querySingleSeriesFromLogDevice({
      config,
      logDevice: chosenLog!,
      deviceName: targetDeviceName,
      readingKey: targetReadingKey,
      from,
      to,
      executeCmd,
    });
    if (primaryTry.ok && primaryTry.points.length > 0) {
      return primaryTry.points;
    }
    // If comparing another device and primary was a dedicated FileLog, look up a matching FileLog/DbLog for compareDevice
    if (sourcePreference === 'auto' && targetDeviceName !== device.name) {
      const altCandidates = [
        ...logDevices.filter((d) => d.type === 'DbLog' && d.name !== chosenLog!.name),
        ...matchFileLogsForDevice(logDevices, targetDeviceName, targetReadingKey).filter(
          (d) => d.name !== chosenLog!.name
        ),
      ];
      for (const alt of altCandidates) {
        const altTry = await querySingleSeriesFromLogDevice({
          config,
          logDevice: alt,
          deviceName: targetDeviceName,
          readingKey: targetReadingKey,
          from,
          to,
          executeCmd,
        });
        if (altTry.ok && altTry.points.length > 0) {
          return altTry.points;
        }
      }
    }
    return [];
  };

  const [secondaryRaw, compareRaw] = await Promise.all([
    secondaryReadingKey ? fetchOptionalSeries(device.name, secondaryReadingKey) : Promise.resolve([]),
    compareDevice ? fetchOptionalSeries(compareDevice.name, readingKey) : Promise.resolve([]),
  ]);

  const rawPointCount = primaryRaw.length;
  const primaryMeta = getReadingMeta(readingKey);
  const secondaryMeta = secondaryReadingKey ? getReadingMeta(secondaryReadingKey) : null;
  const fullStats = computeRawStats(primaryRaw);

  const downsampled = rawPointCount > 220;
  const displayRaw = downsampled ? downsampleRawPoints(primaryRaw, 180) : primaryRaw;
  const toleranceMs = getMergeToleranceMs(timeframe);

  const chartPoints: ChartDataPoint[] = displayRaw.map((pt) => {
    const date = new Date(pt.timestamp);
    const entry: ChartDataPoint = {
      time: formatAxisTime(date, timeframe),
      fullTime: formatFullTimestamp(date),
      timestamp: pt.timestamp,
      value: Number(pt.value.toFixed(primaryMeta.decimals)),
    };

    if (secondaryReadingKey && secondaryMeta && secondaryRaw.length > 0) {
      const secVal = findNearestRawPoint(secondaryRaw, pt.timestamp, toleranceMs);
      if (secVal !== undefined) {
        entry.secondaryValue = Number(secVal.toFixed(secondaryMeta.decimals));
      }
    }

    if (compareDevice && compareRaw.length > 0) {
      const cmpVal = findNearestRawPoint(compareRaw, pt.timestamp, toleranceMs);
      if (cmpVal !== undefined) {
        entry.compareValue = Number(cmpVal.toFixed(primaryMeta.decimals));
      }
    }

    return entry;
  });

  const result: HistoryFetchResult = {
    points: chartPoints,
    stats: fullStats,
    source: chosenLog.type === 'DbLog' ? 'dblog' : 'filelog',
    logDeviceName: chosenLog.name,
    logDeviceType: chosenLog.type,
    rawPointCount,
    downsampled,
    commandUsed,
    latencyMs,
    fetchedAt: Date.now(),
  };

  historyCache.set(cacheKey, {
    expiresAt: Date.now() + HISTORY_CACHE_TTL_MS,
    result,
  });

  return result;
}

/**
 * Generates authentic FHEM DbLog / FileLog text output ("YYYY-MM-DD_HH:MM:SS <val>")
 * for the built-in local test instance so the exact same query & parser pipeline runs end-to-end.
 */
export function generateAuthenticFhemLogOutput(params: {
  deviceName: string;
  readingKey: string;
  currentValue: number;
  fromMs: number;
  toMs: number;
  footerLine: string;
}): string {
  const {deviceName, readingKey, currentValue, fromMs, toMs, footerLine} = params;
  const spanMs = Math.max(60_000, toMs - fromMs);
  const meta = getReadingMeta(readingKey);
  const seed = hashSeed(`${deviceName}:${readingKey}`);

  // Choose realistic FHEM logging interval based on queried span
  let stepMs = 10 * 60_000; // 10 min for <= 6h
  if (spanMs > 14 * 24 * 3600_000) stepMs = 6 * 3600_000; // 6h for 30d
  else if (spanMs > 2 * 24 * 3600_000) stepMs = 2 * 3600_000; // 2h for 7d
  else if (spanMs > 8 * 3600_000) stepMs = 30 * 60_000; // 30 min for 24h

  const count = Math.max(2, Math.min(180, Math.floor(spanMs / stepMs) + 1));
  const lines: string[] = [];

  for (let i = count - 1; i >= 0; i--) {
    const ts = Math.max(fromMs, toMs - i * stepMs);
    const d = new Date(ts);
    const val = synthesizeReadingValue(
      readingKey,
      currentValue,
      i,
      count - 1,
      d,
      seed,
      meta
    );
    lines.push(`${formatFhemLogTimestamp(d)} ${val.toFixed(meta.decimals)}`);
  }

  lines.push(`#${footerLine}`);
  return lines.join('\n');
}

