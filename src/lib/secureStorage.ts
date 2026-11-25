import type {AiAssistantConfig, AppPreferences, CustomMediaStore, FhemConnectionConfig} from '../types/fhem';

const KEYSTORE_DB = 'fhem_control_keystore_v1';
const KEYSTORE_STORE = 'keys';
const MASTER_KEY_ID = 'device_master_aes_gcm';

const APPDATA_DB = 'fhem_control_appdata_v1';
const APPDATA_STORE = 'records';

const CONFIG_RECORD_KEY = 'encrypted_connection_config';
const AI_CONFIG_RECORD_KEY = 'encrypted_ai_assistant_config';
const PREFS_RECORD_KEY = 'app_preferences';
const SANDBOX_STATE_KEY = 'sandbox_fhem_state_v1';
const CUSTOM_MEDIA_KEY = 'custom_media_v1';

export const DEFAULT_CONNECTION_CONFIG: FhemConnectionConfig = {
  mode: 'local_instance',
  apiInterface: 'fhemweb',
  httpMethod: 'GET',
  protocol: 'http',
  host: '192.168.178.50',
  port: 8083,
  basePath: '/fhem',
  transport: 'proxy',
  authType: 'basic',
  username: '',
  password: '',
  apiKey: '',
  customHeaderName: 'X-API-Key',
  customHeaderValue: '',
  queryTokenParam: 'token',
  queryTokenValue: '',
  csrfMode: 'none',
  csrfToken: '',
  acceptSelfSigned: false,
  timeoutMs: 8000,
  pollIntervalSec: 15,
  longpollEnabled: true,
};

const LEGACY_DUMMY_CSRF = 'csrf_8472910482';

function sanitizeLoadedConnectionConfig(parsed: Partial<FhemConnectionConfig>): FhemConnectionConfig {
  const merged: FhemConnectionConfig = {...DEFAULT_CONNECTION_CONFIG, ...parsed};
  if (merged.csrfToken === LEGACY_DUMMY_CSRF) {
    merged.csrfToken = '';
  }
  if (!parsed.csrfMode) {
    merged.csrfMode = merged.csrfToken ? 'manual' : 'none';
  }
  if (merged.httpMethod !== 'GET' && merged.httpMethod !== 'POST') {
    merged.httpMethod = 'GET';
  }
  if (typeof parsed.longpollEnabled !== 'boolean') {
    merged.longpollEnabled = true;
  }
  return merged;
}

export const DEFAULT_FAVORITES: string[] = [
  'HUEDevice_WZ_Decke',
  'HUEDevice_WZ_Stehlampe',
  'ZB_Thermostat_WZ',
  'HM_Rollladen_WZ_Terrasse',
  'ZB_Sensor_WZ_Klima',
  'HUEDevice_Kueche_Arbeitsplatte',
  'ZB_Plug_Kaffee',
  'ZB_Fenster_Buero',
  'HM_Rollladen_SZ_Fenster',
  'ZB_Thermostat_Bad',
  'ZB_Sensor_Garten_Klima',
  'ZB_Plug_ServerRack',
];

export const DEFAULT_PREFERENCES: AppPreferences = {
  theme: 'dark',
  colorTheme: 'ocean',
  favorites: DEFAULT_FAVORITES,
  compactCards: false,
  showZigbeeMetrics: true,
  showVisuals: true,
  tileSizes: {},
  dashboardGrouping: 'grid',
};

export const DEFAULT_CUSTOM_MEDIA: CustomMediaStore = {
  rooms: {},
  devices: {},
};

export const DEFAULT_AI_CONFIG: AiAssistantConfig = {
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  transport: 'proxy',
  temperature: 0.2,
  includeDeviceContext: true,
  customSystemPrompt: '',
};

interface EncryptedPayload {
  v: 1;
  alg: 'AES-GCM-256';
  iv: string;
  ciphertext: string;
  updatedAt: string;
}

function openDatabase(name: string, storeName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available'));
      return;
    }
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open error'));
  });
}

async function idbGet<T>(dbName: string, storeName: string, key: string): Promise<T | undefined> {
  const db = await openDatabase(dbName, storeName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet<T>(dbName: string, storeName: string, key: string, value: T): Promise<void> {
  const db = await openDatabase(dbName, storeName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(dbName: string, storeName: string, key: string): Promise<void> {
  const db = await openDatabase(dbName, storeName);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function getOrCreateDeviceKey(): Promise<CryptoKey> {
  const existing = await idbGet<CryptoKey>(KEYSTORE_DB, KEYSTORE_STORE, MASTER_KEY_ID);
  if (existing) return existing;

  const key = await crypto.subtle.generateKey(
    {name: 'AES-GCM', length: 256},
    false, // non-extractable device key (Web Keystore pattern)
    ['encrypt', 'decrypt']
  );
  await idbSet(KEYSTORE_DB, KEYSTORE_STORE, MASTER_KEY_ID, key);
  return key;
}

export async function isEncryptedKeystoreSupported(): Promise<boolean> {
  return (
    typeof window !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    Boolean(crypto.subtle) &&
    typeof indexedDB !== 'undefined'
  );
}

export async function saveEncryptedConnectionConfig(config: FhemConnectionConfig): Promise<{encrypted: boolean; updatedAt: string}> {
  const updatedAt = new Date().toISOString();
  try {
    if (await isEncryptedKeystoreSupported()) {
      const key = await getOrCreateDeviceKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(JSON.stringify(config));
      const cipherBuffer = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, encoded);
      const payload: EncryptedPayload = {
        v: 1,
        alg: 'AES-GCM-256',
        iv: toBase64(iv),
        ciphertext: toBase64(new Uint8Array(cipherBuffer)),
        updatedAt,
      };
      await idbSet(APPDATA_DB, APPDATA_STORE, CONFIG_RECORD_KEY, payload);
      return {encrypted: true, updatedAt};
    }
  } catch {
    // Fallback below if SubtleCrypto / IndexedDB is restricted
  }

  // Safe fallback: never store raw secrets in unencrypted localStorage
  const safeCopy: FhemConnectionConfig = {
    ...config,
    password: '',
    apiKey: '',
    customHeaderValue: '',
    queryTokenValue: '',
    csrfToken: '',
  };
  localStorage.setItem(CONFIG_RECORD_KEY, JSON.stringify(safeCopy));
  return {encrypted: false, updatedAt};
}

export async function loadEncryptedConnectionConfig(): Promise<{
  config: FhemConnectionConfig;
  encrypted: boolean;
  updatedAt: string | null;
}> {
  try {
    if (await isEncryptedKeystoreSupported()) {
      const payload = await idbGet<EncryptedPayload>(APPDATA_DB, APPDATA_STORE, CONFIG_RECORD_KEY);
      if (payload && payload.v === 1 && payload.ciphertext && payload.iv) {
        const key = await getOrCreateDeviceKey();
        const iv = fromBase64(payload.iv);
        const cipherBytes = fromBase64(payload.ciphertext);
        const plainBuffer = await crypto.subtle.decrypt(
          {name: 'AES-GCM', iv: iv as BufferSource},
          key,
          cipherBytes as BufferSource
        );
        const parsed = JSON.parse(new TextDecoder().decode(plainBuffer)) as Partial<FhemConnectionConfig>;
        return {
          config: sanitizeLoadedConnectionConfig(parsed),
          encrypted: true,
          updatedAt: payload.updatedAt || null,
        };
      }
      return {config: {...DEFAULT_CONNECTION_CONFIG}, encrypted: true, updatedAt: null};
    }
  } catch {
    // Fallback to default on corrupted payload
  }

  try {
    const raw = localStorage.getItem(CONFIG_RECORD_KEY);
    if (raw) {
      return {
        config: sanitizeLoadedConnectionConfig(JSON.parse(raw) as Partial<FhemConnectionConfig>),
        encrypted: false,
        updatedAt: null,
      };
    }
  } catch {
    // ignore
  }
  return {config: {...DEFAULT_CONNECTION_CONFIG}, encrypted: false, updatedAt: null};
}

export async function savePreferences(prefs: AppPreferences): Promise<void> {
  try {
    localStorage.setItem(PREFS_RECORD_KEY, JSON.stringify(prefs));
    if (typeof indexedDB !== 'undefined') {
      await idbSet(APPDATA_DB, APPDATA_STORE, PREFS_RECORD_KEY, prefs);
    }
  } catch {
    // ignore storage quota issues
  }
}

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const stored = await idbGet<Partial<AppPreferences>>(APPDATA_DB, APPDATA_STORE, PREFS_RECORD_KEY);
      if (stored) {
        return {...DEFAULT_PREFERENCES, ...stored};
      }
    }
  } catch {
    // fallback to localStorage
  }

  try {
    const raw = localStorage.getItem(PREFS_RECORD_KEY);
    if (raw) {
      return {...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<AppPreferences>)};
    }
  } catch {
    // ignore
  }
  return {...DEFAULT_PREFERENCES};
}

export async function saveSandboxSnapshot(snapshot: unknown): Promise<void> {
  try {
    if (typeof indexedDB !== 'undefined') {
      await idbSet(APPDATA_DB, APPDATA_STORE, SANDBOX_STATE_KEY, snapshot);
    }
  } catch {
    // ignore
  }
}

export async function loadSandboxSnapshot<T>(): Promise<T | null> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const data = await idbGet<T>(APPDATA_DB, APPDATA_STORE, SANDBOX_STATE_KEY);
      return data ?? null;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function saveEncryptedAiConfig(
  config: AiAssistantConfig
): Promise<{encrypted: boolean; updatedAt: string}> {
  const updatedAt = new Date().toISOString();
  try {
    if (await isEncryptedKeystoreSupported()) {
      const key = await getOrCreateDeviceKey();
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encoded = new TextEncoder().encode(JSON.stringify(config));
      const cipherBuffer = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, encoded);
      const payload: EncryptedPayload = {
        v: 1,
        alg: 'AES-GCM-256',
        iv: toBase64(iv),
        ciphertext: toBase64(new Uint8Array(cipherBuffer)),
        updatedAt,
      };
      await idbSet(APPDATA_DB, APPDATA_STORE, AI_CONFIG_RECORD_KEY, payload);
      return {encrypted: true, updatedAt};
    }
  } catch {
    // Fallback below if SubtleCrypto / IndexedDB is restricted
  }

  // Safe fallback: never persist plaintext API keys in localStorage
  const safeCopy: AiAssistantConfig = {
    ...config,
    apiKey: '',
  };
  localStorage.setItem(AI_CONFIG_RECORD_KEY, JSON.stringify(safeCopy));
  return {encrypted: false, updatedAt};
}

export async function loadEncryptedAiConfig(): Promise<{
  config: AiAssistantConfig;
  encrypted: boolean;
  updatedAt: string | null;
}> {
  try {
    if (await isEncryptedKeystoreSupported()) {
      const payload = await idbGet<EncryptedPayload>(APPDATA_DB, APPDATA_STORE, AI_CONFIG_RECORD_KEY);
      if (payload && payload.v === 1 && payload.ciphertext && payload.iv) {
        const key = await getOrCreateDeviceKey();
        const iv = fromBase64(payload.iv);
        const cipherBytes = fromBase64(payload.ciphertext);
        const plainBuffer = await crypto.subtle.decrypt(
          {name: 'AES-GCM', iv: iv as BufferSource},
          key,
          cipherBytes as BufferSource
        );
        const parsed = JSON.parse(new TextDecoder().decode(plainBuffer)) as Partial<AiAssistantConfig>;
        return {
          config: {...DEFAULT_AI_CONFIG, ...parsed},
          encrypted: true,
          updatedAt: payload.updatedAt || null,
        };
      }
      return {config: {...DEFAULT_AI_CONFIG}, encrypted: true, updatedAt: null};
    }
  } catch {
    // Fallback on corrupted payload
  }

  try {
    const raw = localStorage.getItem(AI_CONFIG_RECORD_KEY);
    if (raw) {
      return {
        config: {...DEFAULT_AI_CONFIG, ...(JSON.parse(raw) as Partial<AiAssistantConfig>)},
        encrypted: false,
        updatedAt: null,
      };
    }
  } catch {
    // ignore
  }
  return {config: {...DEFAULT_AI_CONFIG}, encrypted: false, updatedAt: null};
}

export async function saveCustomMedia(media: CustomMediaStore): Promise<void> {
  try {
    if (typeof indexedDB !== 'undefined') {
      await idbSet(APPDATA_DB, APPDATA_STORE, CUSTOM_MEDIA_KEY, media);
      return;
    }
  } catch {
    // ignore IndexedDB quota issues
  }
  try {
    localStorage.setItem(CUSTOM_MEDIA_KEY, JSON.stringify(media));
  } catch {
    // ignore localStorage quota issues
  }
}

export async function loadCustomMedia(): Promise<CustomMediaStore> {
  try {
    if (typeof indexedDB !== 'undefined') {
      const stored = await idbGet<Partial<CustomMediaStore>>(APPDATA_DB, APPDATA_STORE, CUSTOM_MEDIA_KEY);
      if (stored) {
        return {
          rooms: stored.rooms || {},
          devices: stored.devices || {},
          floorplan: stored.floorplan,
        };
      }
    }
  } catch {
    // ignore
  }
  try {
    const raw = localStorage.getItem(CUSTOM_MEDIA_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CustomMediaStore>;
      return {
        rooms: parsed.rooms || {},
        devices: parsed.devices || {},
        floorplan: parsed.floorplan,
      };
    }
  } catch {
    // ignore
  }
  return {rooms: {}, devices: {}};
}

export async function clearAllLocalData(): Promise<void> {
  try {
    localStorage.removeItem(CONFIG_RECORD_KEY);
    localStorage.removeItem(AI_CONFIG_RECORD_KEY);
    localStorage.removeItem(PREFS_RECORD_KEY);
    localStorage.removeItem(CUSTOM_MEDIA_KEY);
    if (typeof indexedDB !== 'undefined') {
      await idbDelete(APPDATA_DB, APPDATA_STORE, CONFIG_RECORD_KEY);
      await idbDelete(APPDATA_DB, APPDATA_STORE, AI_CONFIG_RECORD_KEY);
      await idbDelete(APPDATA_DB, APPDATA_STORE, PREFS_RECORD_KEY);
      await idbDelete(APPDATA_DB, APPDATA_STORE, SANDBOX_STATE_KEY);
      await idbDelete(APPDATA_DB, APPDATA_STORE, CUSTOM_MEDIA_KEY);
    }
  } catch {
    // ignore
  }
}
