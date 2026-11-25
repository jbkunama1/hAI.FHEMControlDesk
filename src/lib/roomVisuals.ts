import type {CustomMediaStore, FhemDevice} from '../types/fhem';
import roomWohnzimmerImg from '../assets/images/room_wohnzimmer_1795609989699.jpg';
import roomKuecheImg from '../assets/images/room_kueche_1795609990633.jpg';
import roomSchlafzimmerImg from '../assets/images/room_schlafzimmer_1795609991293.jpg';
import roomBueroImg from '../assets/images/room_buero_1795609997082.jpg';
import roomBadImg from '../assets/images/room_bad_1795609993401.jpg';
import roomGartenImg from '../assets/images/room_garten_1795609993422.jpg';

export interface BuiltInVisualPreset {
  id: string;
  label: string;
  subtitle: string;
  src: string;
}

export const BUILT_IN_VISUAL_PRESETS: BuiltInVisualPreset[] = [
  {
    id: 'wohnzimmer',
    label: 'Wohnzimmer',
    subtitle: 'Abendlicht & Wohnbereich',
    src: roomWohnzimmerImg,
  },
  {
    id: 'kueche',
    label: 'Küche',
    subtitle: 'Arbeitslicht & Espresso-Bar',
    src: roomKuecheImg,
  },
  {
    id: 'schlafzimmer',
    label: 'Schlafzimmer',
    subtitle: 'Ruhiges Dämmerlicht & Jalousien',
    src: roomSchlafzimmerImg,
  },
  {
    id: 'buero',
    label: 'Büro & Studio',
    subtitle: 'Schreibtisch & Monitor-Lightbar',
    src: roomBueroImg,
  },
  {
    id: 'bad',
    label: 'Bad & Wellness',
    subtitle: 'Hinterleuchteter Spiegel & Naturstein',
    src: roomBadImg,
  },
  {
    id: 'garten',
    label: 'Garten & Terrasse',
    subtitle: 'Außenbeleuchtung zur Blauen Stunde',
    src: roomGartenImg,
  },
];

export type FallbackBlueprintKind = 'living' | 'tech' | 'hallway' | 'garden' | 'climate' | 'generic';

export interface RoomFallbackTheme {
  gradient: string;
  accentHex: string;
  kind: FallbackBlueprintKind;
}

const SAFE_DATA_IMAGE_RE = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/i;

export function sanitizeImageUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (SAFE_DATA_IMAGE_RE.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/')) {
    // Prevent protocol-relative URLs like //evil.example
    if (trimmed.startsWith('//')) return null;
    return trimmed;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return parsed.toString();
    }
  } catch {
    return null;
  }
  return null;
}

export function getBuiltInRoomImage(roomName: string): {src: string; label: string} | null {
  const lower = roomName.toLowerCase();
  if (lower.includes('wohn') || lower.includes('essz') || lower.includes('lounge')) {
    return {src: roomWohnzimmerImg, label: 'Wohnzimmer'};
  }
  if (lower.includes('küch') || lower.includes('kuech') || lower.includes('koch')) {
    return {src: roomKuecheImg, label: 'Küche'};
  }
  if (lower.includes('schlaf') || lower.includes('kinder') || lower.includes('gast') || lower.includes('bett')) {
    return {src: roomSchlafzimmerImg, label: 'Schlafzimmer'};
  }
  if (lower.includes('büro') || lower.includes('buero') || lower.includes('arbeit') || lower.includes('studio') || lower.includes('office')) {
    return {src: roomBueroImg, label: 'Büro & Studio'};
  }
  if (lower.includes('bad') || lower.includes('wc') || lower.includes('dusche') || lower.includes('wellness')) {
    return {src: roomBadImg, label: 'Bad & Wellness'};
  }
  if (lower.includes('garten') || lower.includes('terrasse') || lower.includes('balkon') || lower.includes('außen') || lower.includes('aussen') || lower.includes('hof')) {
    return {src: roomGartenImg, label: 'Garten & Terrasse'};
  }
  return null;
}

export function resolveRoomImage(
  roomName: string,
  customMedia?: CustomMediaStore
): {src: string | null; isCustom: boolean; presetLabel?: string} {
  const custom = sanitizeImageUrl(customMedia?.rooms?.[roomName]);
  if (custom) {
    return {src: custom, isCustom: true};
  }
  const builtIn = getBuiltInRoomImage(roomName);
  if (builtIn) {
    return {src: builtIn.src, isCustom: false, presetLabel: builtIn.label};
  }
  return {src: null, isCustom: false};
}

export function resolveDeviceImage(
  device: FhemDevice,
  customMedia?: CustomMediaStore
): {src: string | null; isCustom: boolean} {
  const custom = sanitizeImageUrl(customMedia?.devices?.[device.name]);
  if (custom) {
    return {src: custom, isCustom: true};
  }
  const fromAppOptions = sanitizeImageUrl(device.appOptions?.image);
  if (fromAppOptions) {
    return {src: fromAppOptions, isCustom: false};
  }
  return {src: null, isCustom: false};
}

export function getRoomFallbackTheme(roomName: string): RoomFallbackTheme {
  const lower = roomName.toLowerCase();
  if (lower.includes('technik') || lower.includes('server') || lower.includes('keller') || lower.includes('zigbee') || lower.includes('system')) {
    return {
      gradient: 'from-slate-900 via-slate-800 to-cyan-950',
      accentHex: '#38BDF8',
      kind: 'tech',
    };
  }
  if (lower.includes('flur') || lower.includes('diele') || lower.includes('eingang') || lower.includes('treppe')) {
    return {
      gradient: 'from-stone-900 via-zinc-800 to-amber-950',
      accentHex: '#F59E0B',
      kind: 'hallway',
    };
  }
  if (lower.includes('klima') || lower.includes('heiz') || lower.includes('bad')) {
    return {
      gradient: 'from-slate-900 via-teal-950 to-emerald-950',
      accentHex: '#34D399',
      kind: 'climate',
    };
  }
  if (lower.includes('garten') || lower.includes('terrasse') || lower.includes('garage')) {
    return {
      gradient: 'from-slate-900 via-emerald-950 to-slate-900',
      accentHex: '#4ADE80',
      kind: 'garden',
    };
  }
  return {
    gradient: 'from-slate-900 via-slate-800 to-indigo-950',
    accentHex: '#60A5FA',
    kind: 'generic',
  };
}

const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']);
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB raw input limit

export async function compressImageFileToDataUrl(
  file: File,
  maxDimension = 1280,
  quality = 0.84
): Promise<string> {
  if (!ALLOWED_UPLOAD_TYPES.has(file.type.toLowerCase())) {
    throw new Error('Bitte wähle ein Bild im Format JPG, PNG, WebP oder GIF.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('Die Bilddatei ist größer als 15 MB. Bitte wähle eine kleinere Datei.');
  }

  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Datei konnte nicht gelesen werden.'));
    };
    reader.onerror = () => reject(new Error('Fehler beim Lesen der Bilddatei.'));
    reader.readAsDataURL(file);
  });

  // Preserve small animated GIFs directly
  if (file.type.toLowerCase() === 'image/gif' && file.size <= 1.5 * 1024 * 1024) {
    return rawDataUrl;
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Bild konnte nicht dekodiert werden.'));
    el.src = rawDataUrl;
  });

  const scale = Math.min(1, maxDimension / Math.max(img.width, img.height, 1));
  const targetW = Math.max(1, Math.round(img.width * scale));
  const targetH = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return rawDataUrl;

  ctx.drawImage(img, 0, 0, targetW, targetH);

  // Prefer WebP if supported, fall back to JPEG
  const webpUrl = canvas.toDataURL('image/webp', quality);
  if (webpUrl.startsWith('data:image/webp')) {
    return webpUrl;
  }
  return canvas.toDataURL('image/jpeg', quality);
}
