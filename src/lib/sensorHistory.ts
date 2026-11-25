import type {FhemDevice} from '../types/fhem';

export type ChartTimeframe = '6h' | '24h' | '7d' | '30d';

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
