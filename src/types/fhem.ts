export type DeviceCategory =
  | 'light'
  | 'shutter'
  | 'climate'
  | 'sensor'
  | 'switch'
  | 'automation'
  | 'scene'
  | 'system';

export type DeviceStatusTone = 'active' | 'inactive' | 'error' | 'warning';

export interface FhemReading {
  Value: string;
  Time: string;
}

export interface FhemRawDevice {
  Name: string;
  PossibleSets?: string;
  PossibleAttrs?: string;
  Internals: Record<string, string>;
  Readings: Record<string, FhemReading>;
  Attributes: Record<string, string>;
}

export interface FhemJsonList2Response {
  Arg?: string;
  Results: FhemRawDevice[];
  totalResultsReturned: number;
}

export interface DeviceHistoryPoint {
  time: string; // HH:mm
  timestamp: number;
  value: number;
  label: string;
}

export interface FhemAppOptions {
  template?: string;
  name?: string;
  dashboard?: boolean;
  size?: 'sm' | 'wide';
  sortby?: number;
  image?: string;
  info?: {
    left1?: string;
    left2?: string;
    right1?: string;
    right2?: string;
  };
}

export interface FhemDevice {
  name: string;
  alias: string;
  rooms: string[];
  primaryRoom: string;
  type: string;
  model?: string;
  def: string;
  category: DeviceCategory;
  state: string;
  stateTime: string;
  statusTone: DeviceStatusTone;
  statusLabel: string;
  isZigbee: boolean;
  isDimmable: boolean;
  isColorLight: boolean;
  isShutter: boolean;
  isThermostat: boolean;
  isSwitchable: boolean;
  pct?: number;
  ct?: number; // color temp in Kelvin
  rgb?: string; // 6-char uppercase hex without '#', e.g. 'FFAA44'
  temperature?: number;
  desiredTemp?: number;
  humidity?: number;
  power?: number;
  battery?: number;
  linkquality?: number;
  webCmds: string[];
  disabled: boolean;
  appOptions?: FhemAppOptions;
  readings: Record<string, FhemReading>;
  attributes: Record<string, string>;
  internals: Record<string, string>;
  possibleSets: string;
}

export type ConnectionMode = 'local_instance' | 'remote_server';
export type ConnectionTransport = 'proxy' | 'direct';
export type FhemApiInterface = 'fhemweb' | 'fhemweb_post' | 'reverse_proxy' | 'custom_api';
export type FhemAuthType = 'none' | 'basic' | 'apikey' | 'custom_header' | 'query_token';
export type FhemCsrfMode = 'none' | 'auto' | 'manual';

export interface FhemConnectionConfig {
  mode: ConnectionMode;
  apiInterface: FhemApiInterface;
  httpMethod: 'GET' | 'POST';
  protocol: 'http' | 'https';
  host: string;
  port: number;
  basePath: string;
  transport: ConnectionTransport;
  authType: FhemAuthType;
  username: string;
  password: string;
  apiKey: string;
  customHeaderName: string;
  customHeaderValue: string;
  queryTokenParam: string;
  queryTokenValue: string;
  csrfMode: FhemCsrfMode;
  csrfToken: string;
  acceptSelfSigned: boolean;
  timeoutMs: number;
  pollIntervalSec: number; // 0 = off, 5, 10, 30, 60
  longpollEnabled: boolean;
  useServerUpstream?: boolean;
}

export type LongpollState = 'off' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface FhemLongpollUpdate {
  deviceName: string;
  reading: string;
  value: string;
  timestamp: string;
  isTimestampOnly?: boolean;
}

export interface ConnectionStatus {
  online: boolean;
  latencyMs: number | null;
  lastSync: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  fhemVersion: string;
  unsavedChanges: boolean;
  configMode: ConnectionMode;
  longpollState?: LongpollState;
}

export interface FhemEventItem {
  id: string;
  timestamp: string;
  device: string;
  deviceType: string;
  event: string;
  level: 'info' | 'warn' | 'error';
}

export interface FhemLogEntry {
  id: string;
  timestamp: string;
  level: 1 | 2 | 3 | 4 | 5;
  source: string;
  message: string;
}

export interface ScheduleEntry {
  id: string;
  deviceName: string;
  alias: string;
  type: 'at' | 'DOIF' | 'WeekdayTimer';
  branchLabel?: string;
  timeMinutes: number; // 0..1439
  timeLabel: string;
  days: number[]; // 0=Mo .. 6=So
  nextRun: string;
  commandSummary: string;
  active: boolean;
  isSolar: boolean;
  solarType?: 'sunrise' | 'sunset';
  room: string;
  state: string;
}

export type ColorThemeId = 'ocean' | 'emerald' | 'amber' | 'indigo' | 'rose' | 'graphite';
export type TileSize = 'sm' | 'wide';
export type DashboardGrouping = 'grid' | 'rooms';
export type ViewMode = 'auto' | 'mobile' | 'desktop';

export interface AppPreferences {
  theme: 'dark' | 'light';
  colorTheme: ColorThemeId;
  favorites: string[];
  compactCards: boolean;
  showZigbeeMetrics: boolean;
  showVisuals: boolean;
  tileSizes: Record<string, TileSize>;
  dashboardGrouping: DashboardGrouping;
  viewMode?: ViewMode;
}

export interface CustomMediaStore {
  rooms: Record<string, string>;
  devices: Record<string, string>;
  floorplan?: string;
}

export type MediaPickerTarget =
  | {kind: 'room'; key: string; label: string}
  | {kind: 'device'; key: string; label: string}
  | {kind: 'floorplan'; key: 'floorplan'; label: string};

export type ActiveTab = 'dashboard' | 'rooms' | 'devices' | 'calendar' | 'charts' | 'assistant' | 'settings';

export interface ChartTarget {
  deviceName: string;
  readingKey?: string;
}

export interface AiAssistantConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  transport: 'proxy' | 'direct';
  temperature: number;
  includeDeviceContext: boolean;
  customSystemPrompt: string;
}

export interface AiCommandAction {
  id: string;
  command: string;
  kind: 'define' | 'attr' | 'set' | 'get' | 'list' | 'delete' | 'save' | 'other';
  requiresConfirm: boolean;
  label: string;
  executed?: boolean;
  output?: string;
  error?: string;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  commands?: AiCommandAction[];
  mode?: 'openai' | 'local_helper';
  modelUsed?: string;
  latencyMs?: number;
  commandrefTopics?: string[];
}

export interface CommandExecutionResult {
  ok: boolean;
  data: string;
  latencyMs: number;
  statusCode?: number;
  csrfTokenHeader?: string;
  errorCode?: string;
  errorMessage?: string;
  diagnosticHint?: string;
  requestUrlPreview: string;
}

export type UserRole = 'admin' | 'user';

export interface UserAccount {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface ManagedFhemInfo {
  enabled: boolean;
  exclusive: boolean;
  displayTarget?: string;
  protocol?: 'http' | 'https';
  host?: string;
  port?: number;
  basePath?: string;
  httpMethod?: 'GET' | 'POST';
  csrfMode?: FhemCsrfMode;
  authType?: FhemAuthType;
  hasCredentials?: boolean;
}

export interface AuthStatus {
  initialized: boolean;
  userCount: number;
  authenticated: boolean;
  user: UserAccount | null;
  requireLogin: boolean;
  bootstrapTokenRequired: boolean;
  managedFhem?: ManagedFhemInfo;
}

export interface SyncedUserProfile {
  config?: Partial<FhemConnectionConfig>;
  aiConfig?: Partial<AiAssistantConfig>;
  preferences?: Partial<AppPreferences>;
  customMedia?: CustomMediaStore;
  updatedAt?: string;
}

