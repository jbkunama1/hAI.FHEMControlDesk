import type {
  CommandExecutionResult,
  DeviceCategory,
  DeviceStatusTone,
  FhemAppOptions,
  FhemConnectionConfig,
  FhemDevice,
  FhemEventItem,
  FhemJsonList2Response,
  FhemLogEntry,
  FhemLongpollUpdate,
  FhemRawDevice,
  LongpollState,
  ScheduleEntry,
} from '../types/fhem';
import {createInitialEvents, createInitialFhemDevices, createInitialLogs} from './fhemSeedData';
import {loadSandboxSnapshot, saveSandboxSnapshot} from './secureStorage';

export function buildFhemEndpointUrl(
  config: FhemConnectionConfig,
  cmd: string,
  maskSecret = false,
  autoCsrfToken?: string
): string {
  const basePath = config.basePath.startsWith('/') ? config.basePath : `/${config.basePath || 'fhem'}`;
  const query = [`cmd=${encodeURIComponent(cmd)}`, 'XHR=1'];

  const effectiveCsrf =
    autoCsrfToken?.trim() || (config.csrfMode === 'manual' ? config.csrfToken.trim() : '');
  if (effectiveCsrf) {
    const tokenDisplay = maskSecret ? `${effectiveCsrf.slice(0, 5)}••••` : encodeURIComponent(effectiveCsrf);
    query.push(`fwcsrf=${tokenDisplay}`);
  }

  if (config.authType === 'query_token' && config.queryTokenParam.trim() && config.queryTokenValue.trim()) {
    const pName = encodeURIComponent(config.queryTokenParam.trim());
    const pVal = maskSecret ? '••••' : encodeURIComponent(config.queryTokenValue.trim());
    query.push(`${pName}=${pVal}`);
  }

  const baseUrl = `${config.protocol}://${config.host}:${config.port}${basePath}`;
  if (config.httpMethod === 'POST') {
    return `${baseUrl}  [POST body: ${query.join('&')}]`;
  }
  return `${baseUrl}?${query.join('&')}`;
}

function buildFhemParamsString(config: FhemConnectionConfig, cmd: string, csrfTokenOverride?: string): string {
  const query = [`cmd=${encodeURIComponent(cmd)}`, 'XHR=1'];
  const effectiveCsrf =
    csrfTokenOverride?.trim() || (config.csrfMode === 'manual' ? config.csrfToken.trim() : '');
  if (effectiveCsrf) {
    query.push(`fwcsrf=${encodeURIComponent(effectiveCsrf)}`);
  }
  if (config.authType === 'query_token' && config.queryTokenParam.trim() && config.queryTokenValue.trim()) {
    query.push(`${encodeURIComponent(config.queryTokenParam.trim())}=${encodeURIComponent(config.queryTokenValue.trim())}`);
  }
  return query.join('&');
}

function encodeBasicAuthHeader(username: string, password: string): string {
  const raw = `${username}:${password}`;
  try {
    const bytes = new TextEncoder().encode(raw);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `Basic ${btoa(binary)}`;
  } catch {
    return `Basic ${btoa(raw)}`;
  }
}

function parseNumeric(val?: string): number | undefined {
  if (!val) return undefined;
  const match = String(val).match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const num = Number(match[0]);
  return Number.isFinite(num) ? num : undefined;
}

export function normalizeRgbHex(val?: string): string | undefined {
  if (!val) return undefined;
  const cleaned = String(val).trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return undefined;
  return cleaned.toUpperCase();
}

function parseAppOptions(rawAttr?: string): FhemAppOptions | undefined {
  if (!rawAttr || !rawAttr.trim().startsWith('{')) return undefined;
  try {
    const parsed = JSON.parse(rawAttr) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return undefined;
    const infoRaw = parsed.info && typeof parsed.info === 'object' ? (parsed.info as Record<string, unknown>) : undefined;
    return {
      template: typeof parsed.template === 'string' ? parsed.template : undefined,
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
      dashboard: typeof parsed.dashboard === 'boolean' ? parsed.dashboard : undefined,
      size: parsed.size === 'wide' || parsed.size === 'sm' ? parsed.size : undefined,
      sortby: typeof parsed.sortby === 'number' && Number.isFinite(parsed.sortby) ? parsed.sortby : undefined,
      info: infoRaw
        ? {
            left1: typeof infoRaw.left1 === 'string' ? infoRaw.left1 : undefined,
            left2: typeof infoRaw.left2 === 'string' ? infoRaw.left2 : undefined,
            right1: typeof infoRaw.right1 === 'string' ? infoRaw.right1 : undefined,
            right2: typeof infoRaw.right2 === 'string' ? infoRaw.right2 : undefined,
          }
        : undefined,
    };
  } catch {
    return undefined;
  }
}

export function normalizeFhemDevice(raw: FhemRawDevice): FhemDevice {
  const name = raw.Name;
  const attrs = raw.Attributes || {};
  const readings = raw.Readings || {};
  const internals = raw.Internals || {};
  const type = internals.TYPE || 'dummy';
  const def = internals.DEF || '';
  const possibleSets = raw.PossibleSets || '';
  const appOptions = parseAppOptions(attrs.appOptions);

  const roomRaw = attrs.room || 'Unsortiert';
  const rooms = roomRaw
    .split(',')
    .map((r) => r.trim())
    .filter(Boolean);
  const primaryRoom = rooms.find((r) => r !== 'ZigBee' && r !== 'Sensoren' && r !== 'Rollläden' && r !== 'Klima' && r !== 'Szenen') || rooms[0] || 'Unsortiert';

  const alias = appOptions?.name || attrs.alias || name;
  const stateReading = readings.state;
  const state = stateReading?.Value ?? internals.STATE ?? 'unknown';
  const stateTime = stateReading?.Time ?? '';
  const disabled = attrs.disable === '1' || state.toLowerCase() === 'disabled';

  const lowerName = name.toLowerCase();
  const lowerType = type.toLowerCase();
  const lowerState = state.toLowerCase();

  const isZigbee =
    rooms.some((r) => r.toLowerCase() === 'zigbee') ||
    lowerType === 'huedevice' ||
    lowerName.startsWith('zb_') ||
    lowerName.startsWith('huedevice') ||
    'linkquality' in readings ||
    def.toLowerCase().includes('zigbee');

  const isAutomation = ['at', 'doif', 'notify', 'watchdog', 'weekdaytimer'].includes(lowerType);
  const isScene = lowerType === 'lightscene' || lowerType === 'structure' || rooms.includes('Szenen');
  const isSystem = lowerType === 'sysmon' || name === 'ZigBee_Bridge' || lowerType === 'fhemweb' || lowerType === 'global';

  const isThermostat =
    'desired-temp' in readings ||
    possibleSets.includes('desired-temp') ||
    lowerName.includes('thermostat');

  const isShutter =
    (lowerName.includes('rollladen') || lowerName.includes('shutter') || lowerName.includes('blind') || rooms.includes('Rollläden')) &&
    (possibleSets.includes('pct') || 'pct' in readings);

  const isDimmable =
    !isShutter &&
    (possibleSets.includes('pct') || 'pct' in readings || 'bri' in readings) &&
    (lowerType === 'huedevice' || attrs.group === 'Beleuchtung' || lowerName.includes('light') || lowerName.includes('licht'));

  const isColorLight =
    !isShutter &&
    !isThermostat &&
    !isAutomation &&
    (/\brgb\b/i.test(possibleSets) ||
      'rgb' in readings ||
      (attrs.webCmd || '').toLowerCase().includes('rgb'));

  const isSwitchable =
    !isThermostat &&
    !isShutter &&
    !isAutomation &&
    (possibleSets.includes('on') || possibleSets.includes('off') || (attrs.webCmd || '').includes('on:off'));

  let category: DeviceCategory = 'sensor';
  if (isAutomation) category = 'automation';
  else if (isScene) category = 'scene';
  else if (isSystem) category = 'system';
  else if (isShutter) category = 'shutter';
  else if (isThermostat) category = 'climate';
  else if (isDimmable || isColorLight || attrs.group === 'Beleuchtung' || lowerType === 'huedevice') category = 'light';
  else if (isSwitchable || attrs.group === 'Steckdosen' || lowerName.includes('plug')) category = 'switch';
  else category = 'sensor';

  const pct = parseNumeric(readings.pct?.Value ?? (lowerState.startsWith('pct ') ? state.slice(4) : undefined));
  const ct = parseNumeric(readings.ct?.Value);
  const rgb = normalizeRgbHex(readings.rgb?.Value);
  const temperature = parseNumeric(readings.temperature?.Value ?? readings['measured-temp']?.Value);
  const desiredTemp = parseNumeric(readings['desired-temp']?.Value);
  const humidity = parseNumeric(readings.humidity?.Value);
  const power = parseNumeric(readings.power?.Value);
  const battery = parseNumeric(readings.batteryPercent?.Value ?? readings.battery?.Value);
  const linkquality = parseNumeric(readings.linkquality?.Value);

  const webCmds = (attrs.webCmd || '')
    .split(':')
    .map((s) => s.trim())
    .filter(Boolean);

  // Determine explicit semantic status color & German text label
  let statusTone: DeviceStatusTone = 'inactive';
  let statusLabel = state;

  const hasError =
    lowerState.includes('offline') ||
    lowerState.includes('dead') ||
    lowerState.includes('error') ||
    lowerState.includes('unreachable') ||
    readings.availability?.Value?.toLowerCase() === 'offline' ||
    readings.reachable?.Value === '0' ||
    Boolean(readings.lastError?.Value);

  const hasLowBattery = (battery !== undefined && battery <= 20) || readings.battery?.Value?.toLowerCase() === 'low';
  const hasLeakOrSmoke =
    readings.water_leak?.Value === 'wet' ||
    readings.smoke?.Value === 'alarm' ||
    lowerState === 'triggered';

  if (hasError || readings.water_leak?.Value === 'wet' || readings.smoke?.Value === 'alarm') {
    statusTone = 'error';
    statusLabel = hasError ? 'Offline / Fehler' : 'Alarm';
  } else if (hasLowBattery || hasLeakOrSmoke) {
    statusTone = 'warning';
    statusLabel = hasLeakOrSmoke ? 'Ausgelöst' : `Batterie ${battery ?? ''}%`;
  } else if (disabled) {
    statusTone = 'inactive';
    statusLabel = 'Deaktiviert';
  } else if (isShutter) {
    const p = pct ?? 0;
    statusTone = p > 0 ? 'active' : 'inactive';
    statusLabel = p === 100 ? 'Offen (100%)' : p === 0 ? 'Geschlossen (0%)' : `Position ${p}%`;
  } else if (isThermostat) {
    const valve = parseNumeric(readings.valve?.Value) ?? 0;
    statusTone = valve > 0 ? 'active' : 'inactive';
    statusLabel = desiredTemp !== undefined ? `Soll ${desiredTemp.toFixed(1)} °C` : state;
  } else if (isAutomation) {
    const isWeekdayTimer = lowerType === 'weekdaytimer';
    const activeAuto =
      lowerState.startsWith('next:') ||
      lowerState === 'active' ||
      lowerState === 'defined' ||
      lowerState.startsWith('cmd_') ||
      (isWeekdayTimer && !disabled && lowerState !== 'disabled');
    statusTone = activeAuto ? 'active' : 'inactive';
    statusLabel =
      lowerState.startsWith('next:')
        ? `Aktiv · ${state}`
        : lowerState === 'active'
          ? 'Aktiv'
          : lowerState === 'defined'
            ? 'Überwacht'
            : isWeekdayTimer
              ? `Aktiv · ${state}`
              : state;
  } else if (
    lowerState === 'on' ||
    lowerState === 'open' ||
    lowerState === 'motion' ||
    lowerState === 'online' ||
    lowerState === 'active' ||
    (isDimmable && (pct ?? 0) > 0)
  ) {
    statusTone = 'active';
    if (lowerState === 'on') statusLabel = isDimmable && pct !== undefined ? `An · ${pct}%` : 'An';
    else if (lowerState === 'open') statusLabel = 'Offen';
    else if (lowerState === 'motion') statusLabel = 'Bewegung';
    else if (lowerState === 'online') statusLabel = 'Online';
    else if (lowerState === 'active') statusLabel = 'Aktiv';
  } else if (
    lowerState === 'off' ||
    lowerState === 'closed' ||
    lowerState === 'nomotion' ||
    lowerState === 'dry' ||
    lowerState === 'ok'
  ) {
    statusTone = 'inactive';
    if (lowerState === 'off') statusLabel = 'Aus';
    else if (lowerState === 'closed') statusLabel = 'Geschlossen';
    else if (lowerState === 'nomotion') statusLabel = 'Keine Bewegung';
    else if (lowerState === 'dry') statusLabel = 'Trocken';
    else if (lowerState === 'ok') statusLabel = 'OK';
  } else {
    // Numeric sensor values (temperature, power, scenes)
    statusTone = category === 'scene' ? 'active' : 'inactive';
    statusLabel = state;
  }

  return {
    name,
    alias,
    rooms,
    primaryRoom,
    type,
    model: attrs.model,
    def,
    category,
    state,
    stateTime,
    statusTone,
    statusLabel,
    isZigbee,
    isDimmable,
    isColorLight,
    isShutter,
    isThermostat,
    isSwitchable,
    pct,
    ct,
    rgb,
    temperature,
    desiredTemp,
    humidity,
    power,
    battery,
    linkquality,
    webCmds,
    disabled,
    appOptions,
    readings,
    attributes: attrs,
    internals,
    possibleSets,
  };
}

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const WORKDAYS = [0, 1, 2, 3, 4];
const WEEKEND = [5, 6];

const NAMED_DAY_MAP: Record<string, number> = {
  mo: 0,
  mon: 0,
  di: 1,
  tue: 1,
  tu: 1,
  mi: 2,
  wed: 2,
  we: 2,
  do: 3,
  thu: 3,
  th: 3,
  fr: 4,
  fri: 4,
  sa: 5,
  sat: 5,
  so: 6,
  sun: 6,
  su: 6,
};

function fhemDigitToAppDays(ch: string): number[] {
  // FHEM: 0=So, 1=Mo, 2=Di, 3=Mi, 4=Do, 5=Fr, 6=Sa, 7=WE (Sa,So), 8=AT (Mo-Fr)
  switch (ch) {
    case '0':
      return [6];
    case '1':
      return [0];
    case '2':
      return [1];
    case '3':
      return [2];
    case '4':
      return [3];
    case '5':
      return [4];
    case '6':
      return [5];
    case '7':
      return WEEKEND;
    case '8':
      return WORKDAYS;
    default:
      return [];
  }
}

function parseFhemDaySpec(spec?: string): number[] {
  if (!spec || !spec.trim()) return [...ALL_DAYS];
  const raw = spec.trim();
  const lower = raw.toLowerCase();

  if (lower === '!$we' || lower === 'at' || lower === 'workdays' || lower === 'werktags') {
    return [...WORKDAYS];
  }
  if (lower === '$we' || lower === 'we' || lower === 'weekend' || lower === 'wochenende') {
    return [...WEEKEND];
  }

  const daySet = new Set<number>();
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const pLower = part.toLowerCase();
    if (pLower === '!$we' || pLower === 'at') {
      WORKDAYS.forEach((d) => daySet.add(d));
      continue;
    }
    if (pLower === '$we' || pLower === 'we') {
      WEEKEND.forEach((d) => daySet.add(d));
      continue;
    }

    // Named range like Mo-Fr or Sa-So
    const namedRange = pLower.match(/^([a-z]{2,3})-([a-z]{2,3})$/);
    if (namedRange) {
      const start = NAMED_DAY_MAP[namedRange[1]];
      const end = NAMED_DAY_MAP[namedRange[2]];
      if (start !== undefined && end !== undefined) {
        let cur = start;
        for (let guard = 0; guard < 7; guard++) {
          daySet.add(cur);
          if (cur === end) break;
          cur = (cur + 1) % 7;
        }
        continue;
      }
    }

    // Numeric range like 1-5 (FHEM 1=Mo..5=Fr)
    const numRange = pLower.match(/^([0-6])-([0-6])$/);
    if (numRange) {
      const start = fhemDigitToAppDays(numRange[1])[0];
      const end = fhemDigitToAppDays(numRange[2])[0];
      if (start !== undefined && end !== undefined) {
        let cur = start;
        for (let guard = 0; guard < 7; guard++) {
          daySet.add(cur);
          if (cur === end) break;
          cur = (cur + 1) % 7;
        }
        continue;
      }
    }

    // Single named day
    if (NAMED_DAY_MAP[pLower] !== undefined) {
      daySet.add(NAMED_DAY_MAP[pLower]);
      continue;
    }

    // Digit sequence like 12345, 135, 60, 8, 7
    if (/^[0-8]+$/.test(pLower)) {
      for (const ch of pLower) {
        fhemDigitToAppDays(ch).forEach((d) => daySet.add(d));
      }
    }
  }

  return daySet.size > 0 ? Array.from(daySet).sort((a, b) => a - b) : [...ALL_DAYS];
}

function parseClockToMinutes(timeStr: string): {timeMinutes: number; timeLabel: string} | null {
  const m = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isInteger(h) || !Number.isInteger(min) || h < 0 || h > 23 || min < 0 || min > 59) return null;
  return {
    timeMinutes: h * 60 + min,
    timeLabel: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
  };
}

function truncateCmd(text: string, maxLen = 88): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLen ? `${clean.slice(0, maxLen - 1)}…` : clean;
}

function readBalancedGroup(src: string, startIdx: number): {content: string; endIdx: number} | null {
  if (src[startIdx] !== '(') return null;
  let depth = 0;
  for (let i = startIdx; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return {content: src.slice(startIdx + 1, i), endIdx: i + 1};
      }
    }
  }
  return null;
}

function parseDoifBranches(def: string): {
  branches: Array<{index: number; condition: string; action: string}>;
  doelseAction: string;
} {
  const branches: Array<{index: number; condition: string; action: string}> = [];
  let doelseAction = '';
  let i = 0;
  const n = def.length;

  const skipWs = () => {
    while (i < n && /\s/.test(def[i])) i++;
  };

  let branchIdx = 1;
  while (i < n) {
    skipWs();
    if (i >= n) break;

    // Check for DOELSEIF / DOELSE keyword
    const rest = def.slice(i);
    const kwMatch = rest.match(/^(DOELSEIF|DOELSE)\b/i);
    if (kwMatch) {
      const kw = kwMatch[1].toUpperCase();
      i += kwMatch[0].length;
      skipWs();
      if (kw === 'DOELSE') {
        const grp = readBalancedGroup(def, i);
        if (grp) {
          doelseAction = grp.content.trim();
          i = grp.endIdx;
        }
        break;
      }
    }

    const condGrp = readBalancedGroup(def, i);
    if (!condGrp) break;
    i = condGrp.endIdx;
    skipWs();

    const actGrp = readBalancedGroup(def, i);
    const action = actGrp ? actGrp.content.trim() : '';
    if (actGrp) {
      i = actGrp.endIdx;
    }

    branches.push({
      index: branchIdx++,
      condition: condGrp.content.trim(),
      action,
    });
  }

  return {branches, doelseAction};
}

function parseDeviceWeekdaysAttr(device: FhemDevice): number[] | null {
  if (!device.attributes.weekdays) return null;
  const parsed = device.attributes.weekdays
    .split(',')
    .map((x) => Number(x.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return parsed.length > 0 ? Array.from(new Set(parsed)).sort((a, b) => a - b) : null;
}

function inferActionShortLabel(action: string, fallback: string): string {
  const clean = action.trim().toLowerCase();
  if (!clean) return fallback;
  if (/\boff\b/.test(clean) && !/\bon\b/.test(clean)) return 'Aus';
  if (/\bon\b/.test(clean) && !/\boff\b/.test(clean)) return 'An';
  const tempMatch = action.match(/desired-temp\s+(\d+(?:\.\d+)?)/i);
  if (tempMatch) return `${tempMatch[1]} °C`;
  const pctMatch = action.match(/\bpct\s+(\d+)/i);
  if (pctMatch) return `${pctMatch[1]}%`;
  return fallback;
}

export function extractSchedulesFromDevices(devices: FhemDevice[]): ScheduleEntry[] {
  const entries: ScheduleEntry[] = [];

  for (const d of devices) {
    const lowerType = d.type.toLowerCase();

    // 1. Standard FHEM `at` timers
    if (lowerType === 'at') {
      const nextStr = d.readings.Next?.Value || '';
      const parsedClock = parseClockToMinutes(nextStr) || parseClockToMinutes(d.def);
      if (!parsedClock) continue;

      const isSunrise = d.def.toLowerCase().includes('sunrise') || d.readings.solar?.Value === 'sunrise';
      const isSunset = d.def.toLowerCase().includes('sunset') || d.readings.solar?.Value === 'sunset';

      let days = parseDeviceWeekdaysAttr(d) || [...ALL_DAYS];
      if (!d.attributes.weekdays) {
        const wdayMatch = d.def.match(/\$wday\s*==\s*([0-6])/);
        if (wdayMatch) {
          days = fhemDigitToAppDays(wdayMatch[1]);
        } else if (d.def.includes('!$we')) {
          days = [...WORKDAYS];
        } else if (d.def.includes('$we')) {
          days = [...WEEKEND];
        }
      }

      entries.push({
        id: `${d.name}::0::${parsedClock.timeLabel}`,
        deviceName: d.name,
        alias: d.alias,
        type: 'at',
        timeMinutes: parsedClock.timeMinutes,
        timeLabel: parsedClock.timeLabel,
        days,
        nextRun: nextStr || `${parsedClock.timeLabel}:00`,
        commandSummary: truncateCmd(d.def),
        active: !d.disabled,
        isSolar: isSunrise || isSunset,
        solarType: isSunrise ? 'sunrise' : isSunset ? 'sunset' : undefined,
        room: d.primaryRoom,
        state: d.state,
      });
      continue;
    }

    // 2. Multi-time & multi-branch FHEM `DOIF` rules
    if (lowerType === 'doif') {
      const attrDays = parseDeviceWeekdaysAttr(d);
      const {branches, doelseAction} = parseDoifBranches(d.def);
      const deviceEntries: Array<{
        timeMinutes: number;
        timeLabel: string;
        days: number[];
        branchLabel?: string;
        commandSummary: string;
        isSolar: boolean;
        solarType?: 'sunrise' | 'sunset';
        priority: number; // higher wins when deduplicating same device+time+days
      }> = [];

      const totalBranches = branches.length;
      const timerReadings = Object.entries(d.readings)
        .filter(([k]) => /^timer_\d+_c\d+$/i.test(k))
        .sort(([a], [b]) => a.localeCompare(b));

      for (const branch of branches) {
        // Match all bracketed expressions [...] inside the DOIF condition
        const bracketRegex = /\[([^\]]+)\]/g;
        let m: RegExpExecArray | null;
        while ((m = bracketRegex.exec(branch.condition)) !== null) {
          const inner = m[1].trim();
          // Split optional |daySpec at end of bracket
          const pipeIdx = inner.lastIndexOf('|');
          const timePart = pipeIdx !== -1 ? inner.slice(0, pipeIdx).trim() : inner;
          const dayPart = pipeIdx !== -1 ? inner.slice(pipeIdx + 1).trim() : '';

          // Skip device reading conditions like [ZB_Fenster:contact] unless it's a time/solar expression
          const isRange = /^\d{1,2}:\d{2}(?::\d{2})?\s*-\s*\d{1,2}:\d{2}(?::\d{2})?$/.test(timePart);
          const isSingleClock = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(timePart);
          const lowerInner = timePart.toLowerCase();
          const isSolarBracket = lowerInner.includes('sunrise') || lowerInner.includes('sunset');

          if (!isRange && !isSingleClock && !isSolarBracket) continue;

          const days = dayPart ? parseFhemDaySpec(dayPart) : attrDays || [...ALL_DAYS];
          const actionSummary = truncateCmd(branch.action || d.def);

          if (isRange) {
            const [startRaw, endRaw] = timePart.split('-').map((s) => s.trim());
            const startClock = parseClockToMinutes(startRaw);
            const endClock = parseClockToMinutes(endRaw);

            if (startClock) {
              const shortAct = inferActionShortLabel(branch.action, 'Start');
              deviceEntries.push({
                timeMinutes: startClock.timeMinutes,
                timeLabel: startClock.timeLabel,
                days,
                branchLabel: shortAct === 'Start' ? 'Start' : `Start · ${shortAct}`,
                commandSummary: actionSummary,
                isSolar: false,
                priority: 2,
              });
            }
            if (endClock) {
              const endAction = doelseAction ? truncateCmd(doelseAction) : `Zeitfenster Ende (${startRaw}–${endRaw})`;
              const shortEnd = doelseAction ? inferActionShortLabel(doelseAction, 'Ende') : 'Ende';
              deviceEntries.push({
                timeMinutes: endClock.timeMinutes,
                timeLabel: endClock.timeLabel,
                days,
                branchLabel: shortEnd === 'Ende' ? 'Ende' : `Ende · ${shortEnd}`,
                commandSummary: endAction,
                isSolar: false,
                priority: 1, // Explicit DOELSEIF ([23:00]) at the same time wins over range end
              });
            }
          } else if (isSingleClock) {
            const clock = parseClockToMinutes(timePart);
            if (clock) {
              const fallbackLbl = totalBranches > 1 ? `Zweig ${branch.index}` : undefined;
              const shortAct = inferActionShortLabel(branch.action, fallbackLbl || '');
              deviceEntries.push({
                timeMinutes: clock.timeMinutes,
                timeLabel: clock.timeLabel,
                days,
                branchLabel: shortAct || fallbackLbl,
                commandSummary: actionSummary,
                isSolar: false,
                priority: 3,
              });
            }
          } else if (isSolarBracket) {
            const isSunrise = lowerInner.includes('sunrise');
            const isSunset = lowerInner.includes('sunset');
            // Try matching a timer reading for this branch (timer_XX_c0<branch.index>)
            const branchSuffix = `_c${String(branch.index).padStart(2, '0')}`;
            const matchingReading = timerReadings.find(([k]) => k.toLowerCase().endsWith(branchSuffix));
            const clock =
              (matchingReading && parseClockToMinutes(matchingReading[1].Value)) ||
              (isSunrise ? {timeMinutes: 7 * 60 + 42, timeLabel: '07:42'} : {timeMinutes: 17 * 60 + 18, timeLabel: '17:18'});

            deviceEntries.push({
              timeMinutes: clock.timeMinutes,
              timeLabel: clock.timeLabel,
              days,
              branchLabel: isSunrise ? 'Sonnenaufgang' : 'Sonnenuntergang',
              commandSummary: actionSummary,
              isSolar: true,
              solarType: isSunrise ? 'sunrise' : isSunset ? 'sunset' : undefined,
              priority: 2,
            });
          }
        }
      }

      // Fallback / supplement: inspect live FHEM `timer_XX_cYY` readings (e.g. indirect reading timers)
      for (const [readingKey, readingVal] of timerReadings) {
        const clock = parseClockToMinutes(readingVal.Value);
        if (!clock) continue;
        const alreadyCovered = deviceEntries.some((e) => e.timeMinutes === clock.timeMinutes);
        if (alreadyCovered) continue;

        const cMatch = readingKey.match(/_c(\d+)$/i);
        const branchNum = cMatch ? Number(cMatch[1]) : 1;
        const matchedBranch = branches.find((b) => b.index === branchNum);
        const days = attrDays || [...ALL_DAYS];

        deviceEntries.push({
          timeMinutes: clock.timeMinutes,
          timeLabel: clock.timeLabel,
          days,
          branchLabel: `Timer c${String(branchNum).padStart(2, '0')}`,
          commandSummary: truncateCmd(matchedBranch?.action || d.def),
          isSolar: false,
          priority: 1,
        });
      }

      // Deduplicate same (timeMinutes + days) keeping highest priority (explicit branch > range end)
      const deduped = new Map<string, (typeof deviceEntries)[number]>();
      for (const item of deviceEntries) {
        const key = `${item.timeMinutes}|${item.days.join(',')}`;
        const existing = deduped.get(key);
        if (!existing || item.priority > existing.priority) {
          deduped.set(key, item);
        }
      }

      let idx = 0;
      for (const item of deduped.values()) {
        entries.push({
          id: `${d.name}::${idx++}::${item.timeLabel}`,
          deviceName: d.name,
          alias: d.alias,
          type: 'DOIF',
          branchLabel: item.branchLabel,
          timeMinutes: item.timeMinutes,
          timeLabel: item.timeLabel,
          days: item.days,
          nextRun: d.readings.Next?.Value || `${item.timeLabel}:00`,
          commandSummary: item.commandSummary,
          active: !d.disabled,
          isSolar: item.isSolar,
          solarType: item.solarType,
          room: d.primaryRoom,
          state: d.state,
        });
      }
      continue;
    }

    // 3. FHEM `WeekdayTimer` schedules
    if (lowerType === 'weekdaytimer') {
      const tokens = d.def.trim().split(/\s+/).filter(Boolean);
      const targetDevice = tokens[0] || d.name;
      const scheduleTokens = tokens.slice(1).filter((tok) => tok.includes('|'));

      let idx = 0;
      for (const tok of scheduleTokens) {
        const parts = tok.split('|');
        let daysSpec = '';
        let timeSpec = '';
        let valueCmd = '';

        if (parts.length >= 3) {
          daysSpec = parts[0];
          timeSpec = parts[1];
          valueCmd = parts.slice(2).join('|');
        } else if (parts.length === 2) {
          timeSpec = parts[0];
          valueCmd = parts[1];
        } else {
          continue;
        }

        const lowerTime = timeSpec.toLowerCase();
        const isSunrise = lowerTime.includes('sunrise');
        const isSunset = lowerTime.includes('sunset');
        const clock =
          parseClockToMinutes(timeSpec) ||
          (isSunrise
            ? {timeMinutes: 7 * 60 + 42, timeLabel: '07:42'}
            : isSunset
              ? {timeMinutes: 17 * 60 + 18, timeLabel: '17:18'}
              : null);

        if (!clock) continue;

        const days = parseFhemDaySpec(daysSpec);
        const formattedVal = /^\d+(?:\.\d+)?$/.test(valueCmd) ? `${valueCmd} °C` : valueCmd;

        entries.push({
          id: `${d.name}::${idx++}::${clock.timeLabel}`,
          deviceName: d.name,
          alias: d.alias,
          type: 'WeekdayTimer',
          branchLabel: formattedVal || undefined,
          timeMinutes: clock.timeMinutes,
          timeLabel: clock.timeLabel,
          days,
          nextRun: d.readings.nextUpdate?.Value || `${clock.timeLabel}:00`,
          commandSummary: truncateCmd(`set ${targetDevice} ${valueCmd}`),
          active: !d.disabled,
          isSolar: isSunrise || isSunset,
          solarType: isSunrise ? 'sunrise' : isSunset ? 'sunset' : undefined,
          room: d.primaryRoom,
          state: d.state,
        });
      }
    }
  }

  return entries.sort((a, b) => a.timeMinutes - b.timeMinutes || a.alias.localeCompare(b.alias, 'de'));
}

// ============================================================================
// Stateful Local FHEM Protocol Engine (executes authentic FHEMWEB commands)
// ============================================================================

interface SandboxState {
  devices: FhemRawDevice[];
  events: FhemEventItem[];
  logs: FhemLogEntry[];
  unsavedChanges: boolean;
}

class LocalFhemEngine {
  private state: SandboxState | null = null;
  private initialized = false;
  private listeners = new Set<(update: FhemLongpollUpdate) => void>();

  subscribe(listener: (update: FhemLongpollUpdate) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emitLive(deviceName: string, reading: string, value: string, timestamp: string) {
    if (this.listeners.size === 0) return;
    const update: FhemLongpollUpdate = {deviceName, reading, value, timestamp};
    for (const listener of this.listeners) {
      try {
        listener(update);
      } catch {
        // ignore listener errors
      }
    }
  }

  private nowStr(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  async ensureLoaded(): Promise<SandboxState> {
    if (this.initialized && this.state) return this.state;
    const saved = await loadSandboxSnapshot<SandboxState>();
    if (saved && Array.isArray(saved.devices) && saved.devices.length > 0) {
      // Upgrade flagship Hue color lamps in existing persisted snapshots so RGB controls appear immediately
      const rgbDefaults: Record<string, string> = {
        HUEDevice_WZ_Decke: 'FFD4A3',
        HUEDevice_WZ_Stehlampe: 'FFB366',
        HUEDevice_WZ_TV_Strip: '4F46E5',
      };
      const ts = this.nowStr();
      for (const dev of saved.devices) {
        const defaultHex = rgbDefaults[dev.Name];
        if (defaultHex) {
          if (!dev.Readings.rgb) {
            dev.Readings.rgb = {Value: defaultHex, Time: dev.Readings.state?.Time || ts};
          }
          if (dev.PossibleSets && !/\brgb\b/i.test(dev.PossibleSets)) {
            dev.PossibleSets = `${dev.PossibleSets} rgb`;
          }
        }
      }
      this.state = saved;
    } else {
      this.state = {
        devices: createInitialFhemDevices(),
        events: createInitialEvents(),
        logs: createInitialLogs(),
        unsavedChanges: false,
      };
    }
    this.initialized = true;
    return this.state;
  }

  async triggerLiveSimulationTick(): Promise<void> {
    const state = await this.ensureLoaded();
    const ts = this.nowStr();
    const candidates = [
      'ZB_Sensor_WZ_Klima',
      'ZB_Plug_ServerRack',
      'ZB_Plug_Kaffee',
      'ZB_Sensor_Garten_Klima',
      'ZB_Thermostat_WZ',
    ];
    const targetName = candidates[Math.floor(Math.random() * candidates.length)];
    const dev = state.devices.find((d) => d.Name === targetName);
    if (!dev) return;
    const type = dev.Internals.TYPE;

    if (dev.Readings.power && dev.Readings.state?.Value === 'on') {
      const current = Number(dev.Readings.power.Value) || 20;
      const delta = (Math.random() - 0.5) * 3.2;
      const next = Math.max(0.5, Number((current + delta).toFixed(1)));
      dev.Readings.power = {Value: next.toFixed(1), Time: ts};
      this.pushEvent(state, dev.Name, type, `power: ${next.toFixed(1)} W`, 'info');
      this.emitLive(dev.Name, 'power', next.toFixed(1), ts);
      return;
    }

    if (dev.Readings.temperature) {
      const current = Number(dev.Readings.temperature.Value) || 21.0;
      const delta = Math.random() > 0.5 ? 0.1 : -0.1;
      const next = Number((current + delta).toFixed(1));
      dev.Readings.temperature = {Value: next.toFixed(1), Time: ts};
      if (dev.Readings['measured-temp']) {
        dev.Readings['measured-temp'] = {Value: next.toFixed(1), Time: ts};
      }
      if (dev.Readings.humidity) {
        const hum = dev.Readings.humidity.Value;
        const st = `T: ${next.toFixed(1)} H: ${hum}%`;
        dev.Readings.state = {Value: st, Time: ts};
        dev.Internals.STATE = st;
        this.emitLive(dev.Name, 'state', st, ts);
      }
      this.pushEvent(state, dev.Name, type, `temperature: ${next.toFixed(1)} °C`, 'info');
      this.emitLive(dev.Name, 'temperature', next.toFixed(1), ts);
    }
  }

  async reset(): Promise<void> {
    this.state = {
      devices: createInitialFhemDevices(),
      events: createInitialEvents(),
      logs: createInitialLogs(),
      unsavedChanges: false,
    };
    this.initialized = true;
    await saveSandboxSnapshot(this.state);
  }

  private pushEvent(state: SandboxState, device: string, deviceType: string, event: string, level: 'info' | 'warn' | 'error' = 'info') {
    state.events.unshift({
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: this.nowStr(),
      device,
      deviceType,
      event,
      level,
    });
    if (state.events.length > 200) state.events.length = 200;
  }

  private pushLog(state: SandboxState, level: 1 | 2 | 3 | 4 | 5, source: string, message: string) {
    state.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: this.nowStr(),
      level,
      source,
      message,
    });
    if (state.logs.length > 250) state.logs.length = 250;
  }

  async getEvents(): Promise<FhemEventItem[]> {
    const s = await this.ensureLoaded();
    return [...s.events];
  }

  async getLogs(): Promise<FhemLogEntry[]> {
    const s = await this.ensureLoaded();
    return [...s.logs];
  }

  async hasUnsavedChanges(): Promise<boolean> {
    const s = await this.ensureLoaded();
    return s.unsavedChanges;
  }

  async execute(cmd: string, config: FhemConnectionConfig): Promise<CommandExecutionResult> {
    const started = performance.now();
    const state = await this.ensureLoaded();
    const trimmed = cmd.trim();
    const preview = buildFhemEndpointUrl(config, trimmed, true);

    // Realistic minimal processing delay
    await new Promise((r) => setTimeout(r, 18 + Math.round(Math.random() * 24)));
    const latency = Math.max(4, Math.round(performance.now() - started));

    if (!trimmed) {
      return {ok: false, data: '', latencyMs: latency, errorCode: 'INVALID_CMD', errorMessage: 'Leerer Befehl.', requestUrlPreview: preview};
    }

    // jsonlist2 [spec]
    if (trimmed === 'jsonlist2' || trimmed.startsWith('jsonlist2 ')) {
      const arg = trimmed.slice(9).trim();
      let matched = state.devices;
      if (arg) {
        try {
          const rx = new RegExp(`^(${arg})$`, 'i');
          matched = state.devices.filter((d) => rx.test(d.Name));
        } catch {
          matched = state.devices.filter((d) => d.Name.toLowerCase() === arg.toLowerCase());
        }
      }
      const payload: FhemJsonList2Response = {
        Arg: arg,
        Results: matched,
        totalResultsReturned: matched.length,
      };
      return {ok: true, data: JSON.stringify(payload), latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // list [spec]
    if (trimmed === 'list' || trimmed.startsWith('list ')) {
      const arg = trimmed.slice(4).trim();
      if (!arg) {
        const lines = state.devices.map((d) => `${d.Name.padEnd(34)} (${d.Internals.TYPE}) -> ${d.Readings.state?.Value ?? d.Internals.STATE}`);
        return {ok: true, data: lines.join('\n'), latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
      }
      const dev = state.devices.find((d) => d.Name.toLowerCase() === arg.toLowerCase());
      if (!dev) {
        return {ok: true, data: `No device named ${arg} found`, latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
      }
      const detail = [
        `Internals:`,
        ...Object.entries(dev.Internals).map(([k, v]) => `   ${k.padEnd(14)} ${v}`),
        `Readings:`,
        ...Object.entries(dev.Readings).map(([k, r]) => `   ${r.Time}   ${k.padEnd(18)} ${r.Value}`),
        `Attributes:`,
        ...Object.entries(dev.Attributes).map(([k, v]) => `   ${k.padEnd(14)} ${v}`),
      ].join('\n');
      return {ok: true, data: detail, latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // version / uptime
    if (trimmed === 'version') {
      return {
        ok: true,
        data: 'Latest Revision: 29412 (2026-10-12)\nFHEM 6.4 (Lokale Control-Desk Instanz)\nFile             Rev   Last Change\nfhem.pl          29412 2026-10-12 09:14:00Z\n01_FHEMWEB.pm    29388 2026-09-28 18:22:11Z\n10_MQTT2_DEVICE  29401 2026-10-04 12:05:32Z',
        latencyMs: latency,
        statusCode: 200,
        requestUrlPreview: preview,
      };
    }

    if (trimmed === 'uptime') {
      return {ok: true, data: '42 days, 11:28:14', latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // save
    if (trimmed === 'save') {
      state.unsavedChanges = false;
      this.pushLog(state, 3, 'FHEM', 'Konfiguration in fhem.cfg und fhem.save erfolgreich gespeichert.');
      this.pushEvent(state, 'global', 'Global', 'SAVE', 'info');
      await saveSandboxSnapshot(state);
      return {ok: true, data: 'Wrote configuration to fhem.cfg', latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // shutdown restart / shutdown
    if (trimmed === 'shutdown restart' || trimmed === 'shutdown') {
      const isRestart = trimmed.includes('restart');
      this.pushLog(
        state,
        2,
        'FHEM',
        isRestart ? 'Server-Neustart (shutdown restart) ausgeführt. Alle Module neu initialisiert.' : 'FHEM Shutdown-Befehl ausgeführt.'
      );
      this.pushEvent(state, 'global', 'Global', isRestart ? 'SHUTDOWN RESTART' : 'SHUTDOWN', 'warn');
      await saveSandboxSnapshot(state);
      return {
        ok: true,
        data: isRestart ? 'FHEM wird neu gestartet...' : 'FHEM wird heruntergefahren...',
        latencyMs: latency,
        statusCode: 200,
        requestUrlPreview: preview,
      };
    }

    // get <device> <reading>
    if (trimmed.startsWith('get ')) {
      const parts = trimmed.split(/\s+/);
      const devName = parts[1];
      const readingKey = parts[2] || 'state';
      if (devName?.toLowerCase() === 'logfile') {
        const logText = state.logs.map((l) => `${l.timestamp} ${l.level}: [${l.source}] ${l.message}`).join('\n');
        return {ok: true, data: logText, latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
      }
      const dev = state.devices.find((d) => d.Name === devName);
      if (!dev) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'DEVICE_NOT_FOUND', errorMessage: `Gerät „${devName}“ nicht gefunden.`, requestUrlPreview: preview};
      }
      const reading = dev.Readings[readingKey];
      const val = reading ? `${reading.Value} (${reading.Time})` : `Reading „${readingKey}“ nicht vorhanden`;
      this.pushEvent(state, dev.Name, dev.Internals.TYPE, `get ${readingKey} -> ${reading?.Value ?? 'n/a'}`, 'info');
      return {ok: true, data: val, latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // set <device> <action> [value]
    if (trimmed.startsWith('set ')) {
      const match = trimmed.match(/^set\s+(\S+)\s+(.+)$/);
      if (!match) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'SYNTAX_ERROR', errorMessage: 'Syntax: set <device> <command>', requestUrlPreview: preview};
      }
      const [, spec, rest] = match;
      const args = rest.trim().split(/\s+/);
      const action = args[0];
      const value = args.slice(1).join(' ');
      const ts = this.nowStr();

      let targets = state.devices.filter((d) => d.Name === spec);
      if (!targets.length && (spec.includes('.*') || spec.includes('|'))) {
        try {
          const rx = new RegExp(`^(${spec})$`);
          targets = state.devices.filter((d) => rx.test(d.Name));
        } catch {
          targets = [];
        }
      }

      if (!targets.length) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'DEVICE_NOT_FOUND', errorMessage: `Gerät „${spec}“ nicht gefunden.`, requestUrlPreview: preview};
      }

      for (const dev of targets) {
        this.applySetToRawDevice(dev, action, value, ts, state);
      }
      await saveSandboxSnapshot(state);
      return {ok: true, data: '', latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // trigger <device>
    if (trimmed.startsWith('trigger ')) {
      const parts = trimmed.split(/\s+/);
      const devName = parts[1];
      const dev = state.devices.find((d) => d.Name === devName);
      if (!dev) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'DEVICE_NOT_FOUND', errorMessage: `Gerät „${devName}“ nicht gefunden.`, requestUrlPreview: preview};
      }
      const ts = this.nowStr();
      dev.Readings.lastTrigger = {Value: 'manual', Time: ts};
      this.pushEvent(state, dev.Name, dev.Internals.TYPE, `trigger ${parts.slice(2).join(' ') || 'manual'}`, 'info');
      this.pushLog(state, 3, dev.Name, `Manuell ausgelöst über Control Desk.`);
      await saveSandboxSnapshot(state);
      return {ok: true, data: '', latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // attr <device> <attrName> <attrValue>
    if (trimmed.startsWith('attr ')) {
      const match = trimmed.match(/^attr\s+(\S+)\s+(\S+)\s+(.+)$/);
      if (!match) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'SYNTAX_ERROR', errorMessage: 'Syntax: attr <device> <attribute> <value>', requestUrlPreview: preview};
      }
      const [, devName, attrName, attrVal] = match;
      const dev = state.devices.find((d) => d.Name === devName);
      if (!dev) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'DEVICE_NOT_FOUND', errorMessage: `Gerät „${devName}“ nicht gefunden.`, requestUrlPreview: preview};
      }
      dev.Attributes[attrName] = attrVal.trim();
      if (attrName === 'disable') {
        const isDis = attrVal.trim() === '1';
        dev.Readings.state = {Value: isDis ? 'disabled' : dev.Internals.TYPE === 'at' ? `Next: ${dev.Readings.Next?.Value || '07:00:00'}` : 'active', Time: this.nowStr()};
        dev.Internals.STATE = dev.Readings.state.Value;
      }
      state.unsavedChanges = true;
      this.pushEvent(state, 'global', 'Global', `ATTR ${devName} ${attrName} ${attrVal.trim()}`, 'info');
      this.pushLog(state, 3, 'FHEM', `Attribut gesetzt: attr ${devName} ${attrName} ${attrVal.trim()}`);
      await saveSandboxSnapshot(state);
      return {ok: true, data: '', latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // deleteattr <device> <attrName>
    if (trimmed.startsWith('deleteattr ')) {
      const match = trimmed.match(/^deleteattr\s+(\S+)\s+(\S+)$/);
      if (!match) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'SYNTAX_ERROR', errorMessage: 'Syntax: deleteattr <device> <attribute>', requestUrlPreview: preview};
      }
      const [, devName, attrName] = match;
      const dev = state.devices.find((d) => d.Name === devName);
      if (!dev) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'DEVICE_NOT_FOUND', errorMessage: `Gerät „${devName}“ nicht gefunden.`, requestUrlPreview: preview};
      }
      delete dev.Attributes[attrName];
      state.unsavedChanges = true;
      this.pushEvent(state, 'global', 'Global', `DELETEATTR ${devName} ${attrName}`, 'info');
      await saveSandboxSnapshot(state);
      return {ok: true, data: '', latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // define <name> <TYPE> [def...]
    if (trimmed.startsWith('define ')) {
      const match = trimmed.match(/^define\s+([A-Za-z0-9_.-]+)\s+([A-Za-z0-9_]+)(?:\s+(.*))?$/);
      if (!match) {
        return {
          ok: false,
          data: '',
          latencyMs: latency,
          errorCode: 'SYNTAX_ERROR',
          errorMessage: 'Syntax: define <Name> <TYPE> [Definition] (Gerätename ohne Leerzeichen).',
          requestUrlPreview: preview,
        };
      }
      const [, newName, newType, newDef = ''] = match;
      if (state.devices.some((d) => d.Name.toLowerCase() === newName.toLowerCase())) {
        return {
          ok: false,
          data: '',
          latencyMs: latency,
          errorCode: 'ALREADY_EXISTS',
          errorMessage: `Ein Gerät mit dem Namen „${newName}“ existiert bereits.`,
          requestUrlPreview: preview,
        };
      }
      const ts = this.nowStr();
      const lowerType = newType.toLowerCase();
      let initState = 'initialized';
      const readings: Record<string, {Value: string; Time: string}> = {};
      let webCmd = 'on:off';
      let possibleSets = 'on off toggle';
      let room = 'Unsortiert';

      if (lowerType === 'at') {
        const tMatch = newDef.match(/(\d{2}:\d{2}(?::\d{2})?)/);
        const nextVal = tMatch ? (tMatch[1].length === 5 ? `${tMatch[1]}:00` : tMatch[1]) : '08:00:00';
        initState = `Next: ${nextVal}`;
        readings.Next = {Value: nextVal, Time: ts};
        webCmd = 'execNow';
        possibleSets = 'execNow active inactive';
        room = 'Automatisierung';
      } else if (lowerType === 'doif') {
        initState = 'initialized';
        webCmd = 'cmd_1:cmd_2:initialize';
        possibleSets = 'cmd_1 cmd_2 initialize disable enable';
        room = 'Automatisierung';
      } else if (lowerType === 'weekdaytimer') {
        initState = 'active';
        webCmd = 'enable:disable';
        possibleSets = 'enable disable weekprofile';
        room = 'Automatisierung';
      } else if (lowerType === 'notify' || lowerType === 'watchdog') {
        initState = lowerType === 'notify' ? 'active' : 'defined';
        webCmd = lowerType === 'notify' ? 'active:inactive' : 'reset';
        possibleSets = lowerType === 'notify' ? 'active inactive' : 'reset';
        room = 'Automatisierung';
      } else if (lowerType === 'huedevice') {
        initState = 'off';
        readings.pct = {Value: '0', Time: ts};
        readings.linkquality = {Value: '145', Time: ts};
        webCmd = 'on:off:pct';
        possibleSets = 'on off toggle pct:slider,0,1,100';
        room = 'Wohnzimmer,ZigBee';
      } else if (lowerType === 'mqtt2_device') {
        initState = 'off';
        readings.linkquality = {Value: '140', Time: ts};
        room = 'Technik,ZigBee';
      } else {
        initState = 'off';
      }

      readings.state = {Value: initState, Time: ts};
      const created: FhemRawDevice = {
        Name: newName,
        PossibleSets: possibleSets,
        PossibleAttrs: 'alias room group webCmd icon comment disable',
        Internals: {NAME: newName, TYPE: newType, DEF: newDef, STATE: initState, NR: String(state.devices.length + 50)},
        Readings: readings,
        Attributes: {alias: newName, room, webCmd},
      };
      state.devices.unshift(created);
      state.unsavedChanges = true;
      this.pushEvent(state, 'global', 'Global', `DEFINED ${newName} (${newType})`, 'info');
      this.pushLog(state, 3, 'FHEM', `Neues Device definiert: define ${newName} ${newType} ${newDef}`);
      await saveSandboxSnapshot(state);
      return {ok: true, data: '', latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    // delete <name>
    if (trimmed.startsWith('delete ')) {
      const targetName = trimmed.slice(7).trim();
      const idx = state.devices.findIndex((d) => d.Name === targetName);
      if (idx === -1) {
        return {ok: false, data: '', latencyMs: latency, errorCode: 'DEVICE_NOT_FOUND', errorMessage: `Gerät „${targetName}“ nicht gefunden.`, requestUrlPreview: preview};
      }
      state.devices.splice(idx, 1);
      state.unsavedChanges = true;
      this.pushEvent(state, 'global', 'Global', `DELETED ${targetName}`, 'warn');
      this.pushLog(state, 2, 'FHEM', `Device gelöscht: delete ${targetName}`);
      await saveSandboxSnapshot(state);
      return {ok: true, data: '', latencyMs: latency, statusCode: 200, requestUrlPreview: preview};
    }

    return {
      ok: true,
      data: `Befehl „${trimmed}“ empfangen (Lokale Test-Instanz).`,
      latencyMs: latency,
      statusCode: 200,
      requestUrlPreview: preview,
    };
  }

  private applySetToRawDevice(dev: FhemRawDevice, action: string, value: string, ts: string, state: SandboxState) {
    const lowerAction = action.toLowerCase();
    const type = dev.Internals.TYPE;

    // Handle scenes & structures cascading to real devices
    if (dev.Name === 'Struktur_AlleLichter' && (lowerAction === 'on' || lowerAction === 'off')) {
      for (const d of state.devices) {
        if (d.Attributes.group === 'Beleuchtung') {
          d.Readings.state = {Value: lowerAction, Time: ts};
          d.Internals.STATE = lowerAction;
          if ('pct' in d.Readings) {
            d.Readings.pct = {Value: lowerAction === 'on' ? '80' : '0', Time: ts};
          }
        }
      }
    }

    if (dev.Name === 'Szene_Wohnzimmer' && lowerAction === 'scene') {
      const sceneName = value || 'Abendgemütlich';
      dev.Readings.state = {Value: sceneName, Time: ts};
      dev.Internals.STATE = sceneName;
      const wzDecke = state.devices.find((d) => d.Name === 'HUEDevice_WZ_Decke');
      const wzSteh = state.devices.find((d) => d.Name === 'HUEDevice_WZ_Stehlampe');
      const wzTv = state.devices.find((d) => d.Name === 'HUEDevice_WZ_TV_Strip');
      if (sceneName === 'Kinoabend') {
        if (wzDecke) {
          wzDecke.Readings.state = {Value: 'off', Time: ts};
          wzDecke.Readings.pct = {Value: '0', Time: ts};
        }
        if (wzSteh) {
          wzSteh.Readings.state = {Value: 'on', Time: ts};
          wzSteh.Readings.pct = {Value: '20', Time: ts};
        }
        if (wzTv) {
          wzTv.Readings.state = {Value: 'on', Time: ts};
          wzTv.Readings.pct = {Value: '65', Time: ts};
        }
      } else if (sceneName === 'Taghell') {
        if (wzDecke) {
          wzDecke.Readings.state = {Value: 'on', Time: ts};
          wzDecke.Readings.pct = {Value: '100', Time: ts};
        }
        if (wzSteh) {
          wzSteh.Readings.state = {Value: 'on', Time: ts};
          wzSteh.Readings.pct = {Value: '100', Time: ts};
        }
      } else if (sceneName === 'AllesAus') {
        for (const item of [wzDecke, wzSteh, wzTv]) {
          if (item) {
            item.Readings.state = {Value: 'off', Time: ts};
            item.Readings.pct = {Value: '0', Time: ts};
          }
        }
      } else {
        if (wzDecke) {
          wzDecke.Readings.state = {Value: 'on', Time: ts};
          wzDecke.Readings.pct = {Value: '55', Time: ts};
        }
        if (wzSteh) {
          wzSteh.Readings.state = {Value: 'on', Time: ts};
          wzSteh.Readings.pct = {Value: '40', Time: ts};
        }
      }
      this.pushEvent(state, dev.Name, type, `scene: ${sceneName}`, 'info');
      return;
    }

    if (lowerAction === 'toggle') {
      const next = dev.Readings.state?.Value === 'on' ? 'off' : 'on';
      this.applySetToRawDevice(dev, next, '', ts, state);
      return;
    }

    if (lowerAction === 'on' || lowerAction === 'off') {
      dev.Readings.state = {Value: lowerAction, Time: ts};
      dev.Internals.STATE = lowerAction;
      this.emitLive(dev.Name, 'state', lowerAction, ts);
      if ('pct' in dev.Readings && dev.Attributes.group === 'Beleuchtung') {
        const nextPct = lowerAction === 'on' ? (Number(dev.Readings.pct.Value) > 0 ? dev.Readings.pct.Value : '80') : '0';
        dev.Readings.pct = {Value: nextPct, Time: ts};
        this.emitLive(dev.Name, 'pct', nextPct, ts);
      }
      if ('power' in dev.Readings && dev.Attributes.group === 'Steckdosen') {
        const nextPower = lowerAction === 'on' ? '24.5' : '0.0';
        dev.Readings.power = {Value: nextPower, Time: ts};
        this.emitLive(dev.Name, 'power', nextPower, ts);
      }
      this.pushEvent(state, dev.Name, type, `state: ${lowerAction}`, 'info');
      return;
    }

    if (lowerAction === 'pct' || lowerAction === 'dim') {
      const num = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
      dev.Readings.pct = {Value: String(num), Time: ts};
      this.emitLive(dev.Name, 'pct', String(num), ts);
      if (dev.Attributes.group === 'Beschattung' || dev.Name.includes('Rollladen')) {
        dev.Readings.level = {Value: String(num), Time: ts};
        dev.Readings.state = {Value: `pct ${num}`, Time: ts};
        dev.Internals.STATE = `pct ${num}`;
        this.emitLive(dev.Name, 'state', `pct ${num}`, ts);
      } else {
        dev.Readings.bri = {Value: String(Math.round(num * 2.54)), Time: ts};
        const st = num > 0 ? 'on' : 'off';
        dev.Readings.state = {Value: st, Time: ts};
        dev.Internals.STATE = st;
        this.emitLive(dev.Name, 'state', st, ts);
      }
      this.pushEvent(state, dev.Name, type, `pct: ${num}`, 'info');
      return;
    }

    if (lowerAction === 'up' || lowerAction === 'down' || lowerAction === 'stop') {
      if (lowerAction === 'up') {
        dev.Readings.pct = {Value: '100', Time: ts};
        dev.Readings.state = {Value: 'pct 100', Time: ts};
        dev.Internals.STATE = 'pct 100';
        this.emitLive(dev.Name, 'pct', '100', ts);
        this.emitLive(dev.Name, 'state', 'pct 100', ts);
      } else if (lowerAction === 'down') {
        dev.Readings.pct = {Value: '0', Time: ts};
        dev.Readings.state = {Value: 'pct 0', Time: ts};
        dev.Internals.STATE = 'pct 0';
        this.emitLive(dev.Name, 'pct', '0', ts);
        this.emitLive(dev.Name, 'state', 'pct 0', ts);
      } else {
        dev.Readings.motor = {Value: 'stop', Time: ts};
        this.emitLive(dev.Name, 'motor', 'stop', ts);
      }
      this.pushEvent(state, dev.Name, type, `${lowerAction} (${dev.Readings.pct?.Value ?? '0'}%)`, 'info');
      return;
    }

    if (lowerAction === 'ct') {
      const k = Math.max(2000, Math.min(6500, Math.round(Number(value) || 2900)));
      dev.Readings.ct = {Value: String(k), Time: ts};
      this.emitLive(dev.Name, 'ct', String(k), ts);
      this.pushEvent(state, dev.Name, type, `ct: ${k}K`, 'info');
      return;
    }

    if (lowerAction === 'rgb') {
      const hex = normalizeRgbHex(value);
      if (hex) {
        dev.Readings.rgb = {Value: hex, Time: ts};
        this.emitLive(dev.Name, 'rgb', hex, ts);
        const currentPct = Number(dev.Readings.pct?.Value ?? '0');
        if (dev.Readings.state?.Value !== 'on' || currentPct === 0) {
          dev.Readings.state = {Value: 'on', Time: ts};
          dev.Internals.STATE = 'on';
          this.emitLive(dev.Name, 'state', 'on', ts);
          if ('pct' in dev.Readings && currentPct === 0) {
            dev.Readings.pct = {Value: '80', Time: ts};
            dev.Readings.bri = {Value: '203', Time: ts};
            this.emitLive(dev.Name, 'pct', '80', ts);
          }
        }
        this.pushEvent(state, dev.Name, type, `rgb: #${hex}`, 'info');
      }
      return;
    }

    if (lowerAction === 'desired-temp') {
      const t = Math.max(12, Math.min(28, Number(value) || 21));
      const measured = Number(dev.Readings['measured-temp']?.Value ?? dev.Readings.temperature?.Value ?? '21.0');
      const valve = t > measured ? Math.min(100, Math.round((t - measured) * 35 + 20)) : 0;
      dev.Readings['desired-temp'] = {Value: t.toFixed(1), Time: ts};
      dev.Readings.valve = {Value: String(valve), Time: ts};
      const st = `T: ${measured.toFixed(1)} desired: ${t.toFixed(1)} valve: ${valve}%`;
      dev.Readings.state = {Value: st, Time: ts};
      dev.Internals.STATE = st;
      this.emitLive(dev.Name, 'desired-temp', t.toFixed(1), ts);
      this.emitLive(dev.Name, 'valve', String(valve), ts);
      this.emitLive(dev.Name, 'state', st, ts);
      this.pushEvent(state, dev.Name, type, `desired-temp: ${t.toFixed(1)} valve: ${valve}%`, 'info');
      return;
    }

    if (lowerAction === 'boost' || lowerAction === 'auto' || lowerAction === 'manual') {
      dev.Readings.controlMode = {Value: lowerAction, Time: ts};
      this.emitLive(dev.Name, 'controlMode', lowerAction, ts);
      if (lowerAction === 'boost') {
        dev.Readings.valve = {Value: '100', Time: ts};
        this.emitLive(dev.Name, 'valve', '100', ts);
      }
      this.pushEvent(state, dev.Name, type, `controlMode: ${lowerAction}`, 'info');
      return;
    }

    if (lowerAction === 'execnow' || lowerAction === 'reset') {
      dev.Readings.lastExec = {Value: ts, Time: ts};
      if (lowerAction === 'reset' && type === 'watchdog') {
        dev.Readings.state = {Value: 'defined', Time: ts};
        dev.Internals.STATE = 'defined';
        this.emitLive(dev.Name, 'state', 'defined', ts);
      }
      this.pushEvent(state, dev.Name, type, `${action} ausgeführt`, 'info');
      return;
    }

    // Generic fallback
    const newVal = value ? `${action} ${value}` : action;
    dev.Readings.state = {Value: newVal, Time: ts};
    dev.Internals.STATE = newVal;
    this.emitLive(dev.Name, 'state', newVal, ts);
    this.pushEvent(state, dev.Name, type, `state: ${newVal}`, 'info');
  }
}

export const localFhemEngine = new LocalFhemEngine();

// ============================================================================
// Unified Command Executor (Local Instance / Server Proxy / Direct LAN Fetch)
// ============================================================================

export async function executeFhemCommand(config: FhemConnectionConfig, cmd: string): Promise<CommandExecutionResult> {
  const preview = buildFhemEndpointUrl(config, cmd, true);

  if (config.mode === 'local_instance') {
    return localFhemEngine.execute(cmd, config);
  }

  // Remote FHEM Server Mode — Direct Browser LAN Fetch
  if (config.transport === 'direct') {
    const started = performance.now();
    const basePath = config.basePath.startsWith('/') ? config.basePath : `/${config.basePath || 'fhem'}`;
    const baseUrl = `${config.protocol}://${config.host}:${config.port}${basePath}`;
    const isMixedContent =
      typeof window !== 'undefined' &&
      window.location?.protocol === 'https:' &&
      config.protocol === 'http';

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const headers: Record<string, string> = {};
      if (config.authType === 'apikey' && config.apiKey.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
      } else if (config.authType === 'basic' && config.username.trim()) {
        headers.Authorization = encodeBasicAuthHeader(config.username.trim(), config.password);
      } else if (
        config.authType === 'custom_header' &&
        config.customHeaderName.trim() &&
        config.customHeaderValue.trim() &&
        /^[A-Za-z0-9-]{1,64}$/.test(config.customHeaderName.trim())
      ) {
        headers[config.customHeaderName.trim()] = config.customHeaderValue.trim();
      }

      const sendDirect = (csrfOverride?: string) => {
        const paramsStr = buildFhemParamsString(config, cmd, csrfOverride);
        if (config.httpMethod === 'POST') {
          return fetch(baseUrl, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: paramsStr,
            signal: controller.signal,
          });
        }
        return fetch(`${baseUrl}?${paramsStr}`, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });
      };

      let response = await sendDirect();
      const rawAutoCsrf = (response.headers.get('X-FHEM-csrfToken') || '').trim();
      const validAutoCsrf =
        rawAutoCsrf.length > 0 && rawAutoCsrf.toLowerCase() !== 'none' ? rawAutoCsrf : '';

      // Transparent single retry only when CSRF mode is 'auto'
      if (config.csrfMode === 'auto' && (response.status === 400 || response.status === 403)) {
        let retryToken = validAutoCsrf;
        if (!retryToken) {
          const probe = await fetch(`${baseUrl}?XHR=1`, {
            method: 'GET',
            headers,
            signal: controller.signal,
          });
          const probeTok = (probe.headers.get('X-FHEM-csrfToken') || '').trim();
          if (probeTok && probeTok.toLowerCase() !== 'none') {
            retryToken = probeTok;
          }
        }
        if (retryToken) {
          response = await sendDirect(retryToken);
        }
      }

      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      const text = await response.text();

      if (response.status === 401) {
        return {
          ok: false,
          data: '',
          latencyMs,
          statusCode: 401,
          errorCode: 'AUTH_FAILED',
          errorMessage: 'Authentifizierung fehlgeschlagen (HTTP 401).',
          diagnosticHint:
            config.authType === 'basic'
              ? 'Benutzername oder Passwort für HTTP Basic Auth wurden vom FHEM-Server abgelehnt.'
              : 'Der Server verlangt Zugangsdaten (HTTP 401). Wähle im Setup die passende Authentifizierung.',
          requestUrlPreview: preview,
        };
      }
      if (response.status === 400 || response.status === 403) {
        return {
          ok: false,
          data: '',
          latencyMs,
          statusCode: response.status,
          csrfTokenHeader: validAutoCsrf || undefined,
          errorCode: validAutoCsrf ? 'CSRF_REQUIRED' : 'ACCESS_DENIED',
          errorMessage: validAutoCsrf
            ? `FHEMWEB verlangt ein CSRF-Token (HTTP ${response.status}).`
            : `FHEMWEB hat die Anfrage abgelehnt (HTTP ${response.status}).`,
          diagnosticHint: validAutoCsrf
            ? 'CSRF-Schutz ist auf deinem FHEM-Server aktiv. Stelle CSRF-Modus auf „Automatisch erkennen“ oder „Manuell“ (oder in FHEM „attr WEB csrfToken none“).'
            : 'Prüfe Auth-Daten, FHEMWEB-Berechtigungen (allowed) oder stelle CSRF-Modus auf „Automatisch“ / „Manuell“.',
          requestUrlPreview: preview,
        };
      }
      if (!response.ok) {
        return {
          ok: false,
          data: text,
          latencyMs,
          statusCode: response.status,
          errorCode: 'HTTP_ERROR',
          errorMessage: `FHEMWEB antwortete mit HTTP ${response.status}.`,
          diagnosticHint:
            response.status === 404
              ? 'Prüfe den Basispfad (Standard: /fhem).'
              : undefined,
          requestUrlPreview: preview,
        };
      }

      return {
        ok: true,
        data: text,
        latencyMs,
        statusCode: response.status,
        csrfTokenHeader: validAutoCsrf || undefined,
        requestUrlPreview: preview,
      };
    } catch (err: unknown) {
      const latencyMs = Math.max(1, Math.round(performance.now() - started));
      if (err instanceof DOMException && err.name === 'AbortError') {
        return {
          ok: false,
          data: '',
          latencyMs,
          errorCode: 'TIMEOUT',
          errorMessage: `Zeitüberschreitung nach ${config.timeoutMs} ms. FHEM-Server reagiert nicht.`,
          diagnosticHint: 'Prüfe IP/Hostname, Port (Standard 8083 / 443) und ob das Gerät im gleichen WLAN/VPN ist.',
          requestUrlPreview: preview,
        };
      }
      return {
        ok: false,
        data: '',
        latencyMs,
        errorCode: isMixedContent ? 'MIXED_CONTENT' : 'CORS_OR_UNREACHABLE',
        errorMessage: isMixedContent
          ? 'Browser blockiert HTTP-Direktverbindung von einer HTTPS-Seite (Mixed Content).'
          : 'Direktverbindung vom Browser fehlgeschlagen (CORS, Zertifikat oder Server nicht erreichbar).',
        diagnosticHint: isMixedContent
          ? 'Lösungen: (1) FHEM per HTTPS Reverse Proxy erreichbar machen und HTTPS + Server-Proxy nutzen, (2) in FHEM „attr WEB HTTPS 1“ + „attr WEB CORS 1“ setzen, oder (3) die App lokal im LAN über HTTP hosten.'
          : 'Bei direktem Browser-Zugriff benötigt FHEM „attr WEB CORS 1“ (und bei Basic Auth im Reverse Proxy „Access-Control-Allow-Headers: Authorization“). Self-Signed-Zertifikate müssen einmal direkt im Browser geöffnet und akzeptiert werden.',
        requestUrlPreview: preview,
      };
    } finally {
      window.clearTimeout(timer);
    }
  }

  // Remote FHEM Server Mode — Express Backend Proxy (/api/fhem/execute)
  const started = performance.now();
  try {
    const response = await fetch('/api/fhem/execute', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'FHEM-Control-Desk',
      },
      body: JSON.stringify({
        protocol: config.protocol,
        host: config.host,
        port: config.port,
        basePath: config.basePath,
        httpMethod: config.httpMethod,
        cmd,
        csrfMode: config.csrfMode,
        csrfToken: config.csrfMode === 'manual' ? config.csrfToken : '',
        authType: config.authType,
        username: config.authType === 'basic' ? config.username : '',
        password: config.authType === 'basic' ? config.password : '',
        apiKey: config.authType === 'apikey' ? config.apiKey : '',
        customHeaderName: config.authType === 'custom_header' ? config.customHeaderName : '',
        customHeaderValue: config.authType === 'custom_header' ? config.customHeaderValue : '',
        queryTokenParam: config.authType === 'query_token' ? config.queryTokenParam : '',
        queryTokenValue: config.authType === 'query_token' ? config.queryTokenValue : '',
        acceptSelfSigned: config.acceptSelfSigned,
        timeoutMs: config.timeoutMs,
      }),
    });

    const json = (await response.json()) as {
      ok: boolean;
      data?: string;
      latencyMs?: number;
      statusCode?: number;
      csrfTokenHeader?: string;
      errorCode?: string;
      message?: string;
      diagnosticHint?: string;
    };

    const latencyMs = json.latencyMs ?? Math.max(1, Math.round(performance.now() - started));

    if (!json.ok) {
      return {
        ok: false,
        data: json.data || '',
        latencyMs,
        statusCode: json.statusCode,
        csrfTokenHeader: json.csrfTokenHeader,
        errorCode: json.errorCode || 'PROXY_ERROR',
        errorMessage: json.message || 'Kommunikation mit dem FHEM-Server fehlgeschlagen.',
        diagnosticHint: json.diagnosticHint,
        requestUrlPreview: preview,
      };
    }

    return {
      ok: true,
      data: json.data || '',
      latencyMs,
      statusCode: json.statusCode,
      csrfTokenHeader: json.csrfTokenHeader,
      requestUrlPreview: preview,
    };
  } catch {
    const latencyMs = Math.max(1, Math.round(performance.now() - started));
    return {
      ok: false,
      data: '',
      latencyMs,
      errorCode: 'BACKEND_UNREACHABLE',
      errorMessage: 'Lokaler Proxy-Endpunkt nicht erreichbar. Netzwerkverbindung prüfen.',
      requestUrlPreview: preview,
    };
  }
}

export async function fetchAllFhemDevices(config: FhemConnectionConfig): Promise<{
  ok: boolean;
  devices: FhemDevice[];
  latencyMs: number;
  statusCode?: number;
  csrfTokenHeader?: string;
  errorCode?: string;
  errorMessage?: string;
  diagnosticHint?: string;
}> {
  const res = await executeFhemCommand(config, 'jsonlist2');
  if (!res.ok) {
    return {
      ok: false,
      devices: [],
      latencyMs: res.latencyMs,
      statusCode: res.statusCode,
      csrfTokenHeader: res.csrfTokenHeader,
      errorCode: res.errorCode,
      errorMessage: res.errorMessage,
      diagnosticHint: res.diagnosticHint,
    };
  }

  try {
    const parsed = JSON.parse(res.data) as FhemJsonList2Response;
    if (!parsed || !Array.isArray(parsed.Results)) {
      return {
        ok: false,
        devices: [],
        latencyMs: res.latencyMs,
        statusCode: res.statusCode,
        errorCode: 'INVALID_JSONLIST2',
        errorMessage: 'FHEM-Antwort ist kein gültiges jsonlist2-Format.',
        diagnosticHint: 'Prüfe Basispfad (/fhem), ob das Modul jsonlist2 aktiv ist und ob Zugangsdaten/CSRF-Modus stimmen.',
      };
    }

    const devices = parsed.Results.map(normalizeFhemDevice);
    return {
      ok: true,
      devices,
      latencyMs: res.latencyMs,
      statusCode: res.statusCode,
      csrfTokenHeader: res.csrfTokenHeader,
    };
  } catch {
    const snippet = res.data.trim().slice(0, 140).toLowerCase();
    const looksHtml = snippet.startsWith('<!doctype') || snippet.startsWith('<html') || snippet.includes('<form');
    return {
      ok: false,
      devices: [],
      latencyMs: res.latencyMs,
      statusCode: res.statusCode,
      csrfTokenHeader: res.csrfTokenHeader,
      errorCode: 'PARSE_ERROR',
      errorMessage: looksHtml
        ? 'Server antwortete mit einer HTML-Seite statt FHEM jsonlist2-JSON.'
        : 'Konnte FHEM jsonlist2-Antwort nicht als JSON lesen.',
      diagnosticHint: looksHtml
        ? 'Oft liefert ein Reverse Proxy eine Login-Seite oder der Basispfad (/fhem) stimmt nicht. Prüfe Authentifizierung (Basic Auth / Custom Header), Basispfad und CSRF-Modus.'
        : 'Prüfe, ob die Ziel-URL wirklich ein FHEMWEB-Endpunkt ist und ob der CSRF-Modus (Ohne / Automatisch / Manuell) zu deinem Server passt.',
    };
  }
}

// ============================================================================
// FHEMWEB Real-Time Longpoll Parser, State Patcher & Stream Controller
// ============================================================================

function formatCurrentFhemTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function parseFhemLongpollLine(
  rawLine: string,
  knownDeviceNames: string[]
): FhemLongpollUpdate | null {
  const trimmed = rawLine.trim();
  if (!trimmed || !trimmed.startsWith('[')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed) || parsed.length < 2) return null;
  const id = typeof parsed[0] === 'string' ? parsed[0].trim() : '';
  const value = parsed[1] !== null && parsed[1] !== undefined ? String(parsed[1]) : '';
  if (!id) return null;

  // Ignore internal FHEMWEB control directives like ["#FHEMWEB:..."]
  if (id.startsWith('#')) return null;

  const isTimestampOnly = id.endsWith('-ts');
  const effectiveId = isTimestampOnly ? id.slice(0, -3) : id;
  const timestamp = formatCurrentFhemTimestamp();

  // Match against known device names (longest-first handles hyphenated device names reliably)
  if (knownDeviceNames.length > 0) {
    const sorted = [...knownDeviceNames].sort((a, b) => b.length - a.length);
    for (const devName of sorted) {
      if (effectiveId === devName) {
        return {
          deviceName: devName,
          reading: 'state',
          value,
          timestamp: isTimestampOnly ? value : timestamp,
          isTimestampOnly,
        };
      }
      if (effectiveId.startsWith(`${devName}-`)) {
        const reading = effectiveId.slice(devName.length + 1);
        if (reading) {
          return {
            deviceName: devName,
            reading,
            value,
            timestamp: isTimestampOnly ? value : timestamp,
            isTimestampOnly,
          };
        }
      }
    }
  }

  // Fallback for unknown devices: split on first hyphen
  const dashIdx = effectiveId.indexOf('-');
  if (dashIdx === -1) {
    return {
      deviceName: effectiveId,
      reading: 'state',
      value,
      timestamp: isTimestampOnly ? value : timestamp,
      isTimestampOnly,
    };
  }

  const deviceName = effectiveId.slice(0, dashIdx);
  const reading = effectiveId.slice(dashIdx + 1) || 'state';
  return {
    deviceName,
    reading,
    value,
    timestamp: isTimestampOnly ? value : timestamp,
    isTimestampOnly,
  };
}

export function applyLongpollUpdateToDevices(
  devices: FhemDevice[],
  update: FhemLongpollUpdate
): FhemDevice[] {
  const idx = devices.findIndex((d) => d.name === update.deviceName);
  if (idx === -1) return devices;

  const current = devices[idx];
  const nextReadings = {...current.readings};
  const nextInternals = {...current.internals};

  if (update.isTimestampOnly) {
    const existing = nextReadings[update.reading];
    if (!existing) return devices;
    nextReadings[update.reading] = {...existing, Time: update.value || update.timestamp};
  } else {
    nextReadings[update.reading] = {
      Value: update.value,
      Time: update.timestamp,
    };
    if (update.reading === 'state') {
      nextInternals.STATE = update.value;
    }
  }

  const raw: FhemRawDevice = {
    Name: current.name,
    PossibleSets: current.possibleSets,
    Internals: nextInternals,
    Readings: nextReadings,
    Attributes: current.attributes,
  };

  const normalized = normalizeFhemDevice(raw);
  const next = devices.slice();
  next[idx] = normalized;
  return next;
}

const PERMANENT_LONGPOLL_ERRORS = new Set([
  'AUTH_FAILED',
  'PRIVATE_LAN_PROXY_BLOCKED',
  'BLOCKED_HOST',
  'INVALID_PROTOCOL',
  'INVALID_PORT',
  'INVALID_PATH',
  'INVALID_HEADER',
  'INVALID_QUERY_PARAM',
]);

export function startFhemLongpoll(
  config: FhemConnectionConfig,
  callbacks: {
    getKnownDeviceNames: () => string[];
    onUpdate: (update: FhemLongpollUpdate) => void;
    onStateChange: (state: LongpollState, errorMessage?: string) => void;
  }
): {stop: () => void} {
  let stopped = false;
  let abortController: AbortController | null = null;
  let reconnectTimer: number | null = null;
  let simTimer: number | null = null;
  let localUnsub: (() => void) | null = null;
  let backoffMs = 1500;

  const stop = () => {
    stopped = true;
    if (localUnsub) {
      localUnsub();
      localUnsub = null;
    }
    if (simTimer !== null) {
      window.clearInterval(simTimer);
      simTimer = null;
    }
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  // Mode 1: Local 200-Device Test Instance (instant live bus + realistic telemetry ticks)
  if (config.mode === 'local_instance') {
    callbacks.onStateChange('connected');
    localUnsub = localFhemEngine.subscribe((update) => {
      if (!stopped) callbacks.onUpdate(update);
    });
    simTimer = window.setInterval(() => {
      if (!stopped) {
        void localFhemEngine.triggerLiveSimulationTick();
      }
    }, 14_000);
    return {stop};
  }

  const scheduleReconnect = (delayOverride?: number) => {
    if (stopped) return;
    const wait = delayOverride ?? backoffMs;
    backoffMs = Math.min(15_000, Math.round(backoffMs * 1.8));
    callbacks.onStateChange('reconnecting');
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, wait);
  };

  const handleLine = (line: string) => {
    const update = parseFhemLongpollLine(line, callbacks.getKnownDeviceNames());
    if (update) {
      callbacks.onUpdate(update);
    }
  };

  const connect = async () => {
    if (stopped) return;
    callbacks.onStateChange('connecting');
    abortController = new AbortController();

    try {
      // Mode 2: Remote Server via Express SSE Proxy (/api/fhem/longpoll)
      if (config.transport === 'proxy') {
        const response = await fetch('/api/fhem/longpoll', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'FHEM-Control-Desk',
          },
          body: JSON.stringify({
            protocol: config.protocol,
            host: config.host,
            port: config.port,
            basePath: config.basePath,
            csrfMode: config.csrfMode,
            csrfToken: config.csrfMode === 'manual' ? config.csrfToken : '',
            authType: config.authType,
            username: config.authType === 'basic' ? config.username : '',
            password: config.authType === 'basic' ? config.password : '',
            apiKey: config.authType === 'apikey' ? config.apiKey : '',
            customHeaderName: config.authType === 'custom_header' ? config.customHeaderName : '',
            customHeaderValue: config.authType === 'custom_header' ? config.customHeaderValue : '',
            queryTokenParam: config.authType === 'query_token' ? config.queryTokenParam : '',
            queryTokenValue: config.authType === 'query_token' ? config.queryTokenValue : '',
            acceptSelfSigned: config.acceptSelfSigned,
            timeoutMs: config.timeoutMs,
          }),
          signal: abortController.signal,
        });

        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/event-stream')) {
          const errJson = (await response.json().catch(() => ({}))) as {
            errorCode?: string;
            message?: string;
          };
          if (errJson.errorCode && PERMANENT_LONGPOLL_ERRORS.has(errJson.errorCode)) {
            callbacks.onStateChange('error', errJson.message || 'Longpoll-Verbindung abgelehnt.');
            return;
          }
          callbacks.onStateChange('error', errJson.message || 'Longpoll nicht verfügbar.');
          scheduleReconnect();
          return;
        }

        if (!response.body) {
          scheduleReconnect();
          return;
        }

        backoffMs = 1500;
        callbacks.onStateChange('connected');

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let sseBuffer = '';

        while (!stopped) {
          const {done, value} = await reader.read();
          if (done) break;
          sseBuffer += decoder.decode(value, {stream: true});

          let blockEnd = sseBuffer.indexOf('\n\n');
          while (blockEnd !== -1) {
            const rawBlock = sseBuffer.slice(0, blockEnd);
            sseBuffer = sseBuffer.slice(blockEnd + 2);

            let eventName = 'message';
            const dataLines: string[] = [];
            for (const row of rawBlock.split('\n')) {
              if (row.startsWith('event:')) {
                eventName = row.slice(6).trim();
              } else if (row.startsWith('data:')) {
                dataLines.push(row.slice(5).trim());
              }
            }
            const dataStr = dataLines.join('\n');
            if (eventName === 'connected') {
              callbacks.onStateChange('connected');
            } else if (eventName === 'update' && dataStr) {
              try {
                const payload = JSON.parse(dataStr) as {line?: string};
                if (payload.line) handleLine(payload.line);
              } catch {
                // ignore malformed frame
              }
            } else if (eventName === 'reconnect') {
              if (!stopped) {
                reader.cancel().catch(() => undefined);
                scheduleReconnect(350);
                return;
              }
            } else if (eventName === 'error') {
              callbacks.onStateChange('reconnecting');
            }

            blockEnd = sseBuffer.indexOf('\n\n');
          }
        }

        if (!stopped) {
          scheduleReconnect();
        }
        return;
      }

      // Mode 3: Remote Server Direct LAN Fetch Stream
      const isMixedContent =
        typeof window !== 'undefined' &&
        window.location?.protocol === 'https:' &&
        config.protocol === 'http';
      if (isMixedContent) {
        callbacks.onStateChange(
          'error',
          'Browser blockiert HTTP-Longpoll von einer HTTPS-Seite (Mixed Content). Bitte FHEM auf HTTPS umstellen.'
        );
        return;
      }

      const basePath = config.basePath.startsWith('/') ? config.basePath : `/${config.basePath || 'fhem'}`;
      const baseUrl = `${config.protocol}://${config.host}:${config.port}${basePath}`;
      const headers: Record<string, string> = {};
      if (config.authType === 'apikey' && config.apiKey.trim()) {
        headers.Authorization = `Bearer ${config.apiKey.trim()}`;
      } else if (config.authType === 'basic' && config.username.trim()) {
        headers.Authorization = encodeBasicAuthHeader(config.username.trim(), config.password);
      } else if (
        config.authType === 'custom_header' &&
        config.customHeaderName.trim() &&
        config.customHeaderValue.trim() &&
        /^[A-Za-z0-9-]{1,64}$/.test(config.customHeaderName.trim())
      ) {
        headers[config.customHeaderName.trim()] = config.customHeaderValue.trim();
      }

      const queryParts = [
        'XHR=1',
        'inform=type=status;filter=.*;since=null;fmt=JSON',
        `timestamp=${Date.now()}`,
      ];
      if (config.csrfMode === 'manual' && config.csrfToken.trim()) {
        queryParts.push(`fwcsrf=${encodeURIComponent(config.csrfToken.trim())}`);
      }
      if (config.authType === 'query_token' && config.queryTokenParam.trim() && config.queryTokenValue.trim()) {
        queryParts.push(
          `${encodeURIComponent(config.queryTokenParam.trim())}=${encodeURIComponent(config.queryTokenValue.trim())}`
        );
      }

      const response = await fetch(`${baseUrl}?${queryParts.join('&')}`, {
        method: 'GET',
        headers,
        signal: abortController.signal,
      });

      if (response.status === 401) {
        callbacks.onStateChange('error', 'Longpoll-Authentifizierung fehlgeschlagen (HTTP 401).');
        return;
      }
      if (!response.ok || !response.body) {
        callbacks.onStateChange('error', `FHEMWEB Longpoll antwortete mit HTTP ${response.status}.`);
        scheduleReconnect();
        return;
      }

      backoffMs = 1500;
      callbacks.onStateChange('connected');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let lineBuf = '';

      while (!stopped) {
        const {done, value} = await reader.read();
        if (done) break;
        lineBuf += decoder.decode(value, {stream: true});
        let nlIdx = lineBuf.indexOf('\n');
        while (nlIdx !== -1) {
          const line = lineBuf.slice(0, nlIdx).trim();
          lineBuf = lineBuf.slice(nlIdx + 1);
          if (line) handleLine(line);
          nlIdx = lineBuf.indexOf('\n');
        }
      }

      if (!stopped) {
        scheduleReconnect();
      }
    } catch (err: unknown) {
      if (stopped) return;
      if (err instanceof DOMException && err.name === 'AbortError') return;
      scheduleReconnect();
    }
  };

  void connect();
  return {stop};
}

