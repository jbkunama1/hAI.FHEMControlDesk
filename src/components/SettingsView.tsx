import React, {useEffect, useMemo, useState} from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Image as ImageIcon,
  ImagePlus,
  KeyRound,
  Lock,
  Monitor,
  Pause,
  Play,
  PlusCircle,
  PowerOff,
  Radio,
  RefreshCw,
  RotateCcw,
  Rows3,
  Save,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Terminal,
  Trash2,
  Users,
  Wifi,
} from 'lucide-react';
import type {
  AppPreferences,
  AuthStatus,
  ConnectionStatus,
  CustomMediaStore,
  FhemApiInterface,
  FhemAuthType,
  FhemConnectionConfig,
  FhemCsrfMode,
  FhemDevice,
  FhemEventItem,
  FhemLogEntry,
  MediaPickerTarget,
  UserAccount,
  ViewMode,
} from '../types/fhem';
import {buildFhemEndpointUrl} from '../lib/fhemClient';
import {resolveRoomImage} from '../lib/roomVisuals';
import {PWAInstallButton} from './PWAInstallButton';
import {ProfileAdminSection} from './ProfileAdminSection';
import {SmartVisualImage} from './SmartVisualImage';
import {ThemeGallery} from './ThemePicker';

export interface ConnectionTestOutcome {
  ok: boolean;
  message: string;
  latencyMs?: number;
  statusCode?: number;
  errorCode?: string;
  csrfToken?: string;
  diagnosticHint?: string;
}

interface SettingsViewProps {
  config: FhemConnectionConfig;
  status: ConnectionStatus;
  preferences: AppPreferences;
  devices: FhemDevice[];
  customMedia: CustomMediaStore;
  keystoreEncrypted: boolean;
  keystoreUpdatedAt: string | null;
  events: FhemEventItem[];
  logs: FhemLogEntry[];
  eventsPaused: boolean;
  onToggleEventsPaused: () => void;
  onClearEvents: () => void;
  onReloadLogs: () => Promise<void>;
  onSaveConfig: (next: FhemConnectionConfig) => Promise<void>;
  onTestConnection: (candidate: FhemConnectionConfig) => Promise<ConnectionTestOutcome>;
  onUpdatePreferences: (patch: Partial<AppPreferences>) => void;
  onOpenMediaPicker: (target: MediaPickerTarget) => void;
  onExecuteConsoleCommand: (cmd: string) => Promise<{ok: boolean; data: string; errorMessage?: string; requestUrlPreview: string; latencyMs: number}>;
  onSaveFhemCfg: () => void;
  onRequestRestartFhem: () => void;
  onRequestShutdownFhem: () => void;
  onOpenDefineModal: () => void;
  onRequestResetLocalData: () => void;
  onOpenAiAssistant: () => void;
  authStatus: AuthStatus;
  currentUser: UserAccount | null;
  profileSyncing: boolean;
  lastProfileSyncedAt: string | null;
  initialSection?: SettingsSection | null;
  onClearInitialSection?: () => void;
  onOpenAccountModal: () => void;
  onPullProfile: () => Promise<void>;
  onPushProfile: () => Promise<void>;
  onLogout: () => Promise<void>;
  onRefreshAuthStatus: () => Promise<void>;
}

export type SettingsSection = 'connection' | 'profile' | 'admin' | 'logs' | 'app';

export const SettingsView: React.FC<SettingsViewProps> = ({
  config,
  status,
  preferences,
  devices,
  customMedia,
  keystoreEncrypted,
  keystoreUpdatedAt,
  events,
  logs,
  eventsPaused,
  onToggleEventsPaused,
  onClearEvents,
  onReloadLogs,
  onSaveConfig,
  onTestConnection,
  onUpdatePreferences,
  onOpenMediaPicker,
  onExecuteConsoleCommand,
  onSaveFhemCfg,
  onRequestRestartFhem,
  onRequestShutdownFhem,
  onOpenDefineModal,
  onRequestResetLocalData,
  onOpenAiAssistant,
  authStatus,
  currentUser,
  profileSyncing,
  lastProfileSyncedAt,
  initialSection,
  onClearInitialSection,
  onOpenAccountModal,
  onPullProfile,
  onPushProfile,
  onLogout,
  onRefreshAuthStatus,
}) => {
  const [section, setSection] = useState<SettingsSection>(initialSection || 'connection');
  const [draft, setDraft] = useState<FhemConnectionConfig>(config);
  const [showSecrets, setShowSecrets] = useState(false);

  useEffect(() => {
    if (initialSection) {
      setSection(initialSection);
      onClearInitialSection?.();
    }
  }, [initialSection, onClearInitialSection]);

  useEffect(() => {
    setDraft(config);
  }, [config]);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testFeedback, setTestFeedback] = useState<ConnectionTestOutcome | null>(null);
  const [copiedFhemSnippet, setCopiedFhemSnippet] = useState(false);

  // Admin Console state
  const [consoleCmd, setConsoleCmd] = useState('version');
  const [consoleOutput, setConsoleOutput] = useState<string>('');
  const [consoleUrlPreview, setConsoleUrlPreview] = useState<string>('');
  const [consoleRunning, setConsoleRunning] = useState(false);

  // Monitor / Logfile state
  const [monitorTab, setMonitorTab] = useState<'events' | 'logfile'>('events');
  const [eventFilter, setEventFilter] = useState('');
  const [logLevelFilter, setLogLevelFilter] = useState<'all' | 'error' | 'warn'>('all');
  const [logSearch, setLogSearch] = useState('');

  const filteredEvents = useMemo(() => {
    const q = eventFilter.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (ev) =>
        ev.device.toLowerCase().includes(q) ||
        ev.event.toLowerCase().includes(q) ||
        ev.deviceType.toLowerCase().includes(q)
    );
  }, [events, eventFilter]);

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return logs.filter((l) => {
      if (logLevelFilter === 'error' && l.level > 2) return false;
      if (logLevelFilter === 'warn' && l.level > 3) return false;
      if (q && !l.message.toLowerCase().includes(q) && !l.source.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, logLevelFilter, logSearch]);

  const detectedRooms = useMemo(() => {
    const set = new Set<string>();
    for (const d of devices) {
      if (d.primaryRoom) set.add(d.primaryRoom);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'de'));
  }, [devices]);

  const looksLikePrivateLanHost = useMemo(() => {
    const h = draft.host.trim().toLowerCase();
    return (
      h === 'localhost' ||
      h.endsWith('.local') ||
      h.endsWith('.lan') ||
      h.endsWith('.fritz.box') ||
      h.startsWith('192.168.') ||
      h.startsWith('10.') ||
      h.startsWith('127.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
    );
  }, [draft.host]);

  const isHttpsPageWithHttpDirect =
    typeof window !== 'undefined' &&
    window.location?.protocol === 'https:' &&
    draft.mode === 'remote_server' &&
    draft.transport === 'direct' &&
    draft.protocol === 'http';

  const applyInterfacePreset = (iface: FhemApiInterface) => {
    setDraft((prev) => {
      if (iface === 'fhemweb') {
        return {
          ...prev,
          mode: 'remote_server',
          apiInterface: iface,
          httpMethod: 'GET',
          protocol: 'http',
          port: prev.port === 443 ? 8083 : prev.port,
          basePath: prev.basePath || '/fhem',
        };
      }
      if (iface === 'reverse_proxy') {
        return {
          ...prev,
          mode: 'remote_server',
          apiInterface: iface,
          httpMethod: 'GET',
          protocol: 'https',
          port: prev.port === 8083 ? 443 : prev.port,
          transport: 'proxy',
          basePath: prev.basePath || '/fhem',
        };
      }
      if (iface === 'fhemweb_post') {
        return {
          ...prev,
          mode: 'remote_server',
          apiInterface: iface,
          httpMethod: 'POST',
          basePath: prev.basePath || '/fhem',
        };
      }
      return {
        ...prev,
        mode: 'remote_server',
        apiInterface: iface,
      };
    });
  };

  const handleHostInputChange = (rawVal: string) => {
    const trimmed = rawVal.trim();
    if (/^https?:\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        const proto = parsed.protocol === 'https:' ? 'https' : 'http';
        const port = parsed.port ? Number(parsed.port) : proto === 'https' ? 443 : 8083;
        const cleanPath = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname.replace(/\/+$/, '') : '/fhem';
        setDraft((p) => ({
          ...p,
          protocol: proto,
          host: parsed.hostname,
          port: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : p.port,
          basePath: cleanPath,
        }));
        return;
      } catch {
        // fall through to normal host update
      }
    }
    setDraft((p) => ({...p, host: rawVal}));
  };

  const handleTest = async (overrideDraft?: FhemConnectionConfig) => {
    const candidate = overrideDraft || draft;
    setTesting(true);
    setTestFeedback(null);
    const res = await onTestConnection(candidate);
    setTestFeedback({
      ...res,
      message: res.ok && res.latencyMs !== undefined ? `${res.message} (${res.latencyMs} ms)` : res.message,
    });
    setTesting(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await onSaveConfig(draft);
    setSaving(false);
    setTestFeedback({
      ok: true,
      message: draft.useServerUpstream
        ? 'Verbindungseinstellungen (Longpoll, Polling & Timeout) gespeichert.'
        : 'Serverdaten lokal verschlüsselt gespeichert und aktiviert.',
    });
  };

  const runConsole = async (cmdOverride?: string) => {
    const cmd = (cmdOverride ?? consoleCmd).trim();
    if (!cmd) return;
    if (cmdOverride) setConsoleCmd(cmdOverride);
    setConsoleRunning(true);
    const res = await onExecuteConsoleCommand(cmd);
    setConsoleUrlPreview(res.requestUrlPreview);
    if (res.ok) {
      setConsoleOutput(res.data || `(OK · ${res.latencyMs} ms · keine Textausgabe)`);
    } else {
      setConsoleOutput(`FEHLER: ${res.errorMessage || 'Befehl fehlgeschlagen'}`);
    }
    setConsoleRunning(false);
  };

  const endpointPreview = buildFhemEndpointUrl(draft, 'jsonlist2', !showSecrets);

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
          Einstellungen & Administration
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          FHEMWEB-Verbindung, verschlüsselter Tresor, Server-Verwaltung, Event-Monitor und App-Design
        </p>
      </div>

      {/* Section Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 rounded-2xl border theme-surface p-1.5">
        {(
          [
            {id: 'connection', label: 'Server & Tresor', icon: Server},
            {id: 'profile', label: 'Profil & Benutzer', icon: Users},
            {id: 'admin', label: 'Server-Admin', icon: Terminal},
            {id: 'logs', label: 'Events & Logfile', icon: FileText},
            {id: 'app', label: 'Design & Bilder', icon: Sun},
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap ${
                active
                  ? 'theme-btn-primary'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION: PROFILE & USER MANAGEMENT */}
      {section === 'profile' && (
        <ProfileAdminSection
          authStatus={authStatus}
          currentUser={currentUser}
          syncing={profileSyncing}
          lastSyncedAt={lastProfileSyncedAt}
          onOpenAccountModal={onOpenAccountModal}
          onPullProfile={onPullProfile}
          onPushProfile={onPushProfile}
          onLogout={onLogout}
          onRefreshAuthStatus={onRefreshAuthStatus}
        />
      )}

      {/* SECTION 1: CONNECTION & ENCRYPTED KEYSTORE */}
      {section === 'connection' && (
        <form onSubmit={handleSave} className="space-y-5">
          {/* Server-Managed FHEM Stack Banner (Exclusive or Optional Mode) */}
          {authStatus.managedFhem?.enabled && (
            <div className="rounded-2xl border border-[var(--accent-ring)] theme-surface p-5 space-y-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl theme-tonal">
                    <ShieldCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                      {authStatus.managedFhem.exclusive
                        ? 'FHEM-Stack-Modus aktiv (Exklusive WebUI)'
                        : 'FHEM-Stack-Server vorkonfiguriert'}
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                      {authStatus.managedFhem.exclusive
                        ? 'Diese Instanz ist fest über die Server-Konfiguration (.env) an deinen FHEM-Server gebunden. Zugangsdaten verlassen den Server nicht und die Test-Instanz ist deaktiviert.'
                        : 'Ein fester FHEM-Server ist im Stack vorkonfiguriert. Du kannst ihn direkt nutzen oder optional eine abweichende Verbindung testen.'}
                    </p>
                  </div>
                </div>
                <span className="rounded-xl theme-tonal px-2.5 py-1 font-mono text-[11px] font-semibold">
                  {authStatus.managedFhem.exclusive ? 'Exklusiv' : 'Stack-Standard'}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 rounded-2xl border theme-border bg-[var(--m3-canvas)]/70 p-3.5 text-xs">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">FHEM-Ziel (intern)</div>
                  <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100 break-all">
                    {authStatus.managedFhem.displayTarget || 'Server-Konfiguration'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Authentifizierung</div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {authStatus.managedFhem.hasCredentials
                      ? `Serverseitig geschützt (${authStatus.managedFhem.authType || 'aktiv'})`
                      : 'Internes Netz (ohne Passwort)'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Methode & CSRF</div>
                  <div className="mt-0.5 font-mono font-semibold text-slate-900 dark:text-slate-100">
                    {authStatus.managedFhem.httpMethod || 'GET'} · CSRF {authStatus.managedFhem.csrfMode || 'auto'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Operating Mode Switch (hidden when Exclusive Stack Mode locks the target) */}
          {!authStatus.managedFhem?.exclusive && (
            <div className="rounded-2xl border theme-surface p-5 space-y-4">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Betriebsmodus
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verbinde dich mit deinem lokalen FHEM-Server oder nutze die integrierte 200-Geräte-Testinstanz.
                </p>
              </div>

              <div
                className={`grid grid-cols-1 gap-3 ${
                  authStatus.managedFhem?.enabled ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
                }`}
              >
                {authStatus.managedFhem?.enabled && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        mode: 'remote_server',
                        transport: 'proxy',
                        useServerUpstream: true,
                        protocol: authStatus.managedFhem?.protocol || p.protocol,
                        host: authStatus.managedFhem?.host || p.host,
                        port: authStatus.managedFhem?.port || p.port,
                        basePath: authStatus.managedFhem?.basePath || p.basePath,
                      }))
                    }
                    className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-colors ${
                      draft.useServerUpstream
                        ? 'border-[var(--accent-ring)] theme-tonal'
                        : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="text-sm font-semibold">Stack-Server (.env)</span>
                    <span className="mt-1 text-xs opacity-80">
                      Nutzt direkt die serverseitig hinterlegte FHEM-Verbindung ({authStatus.managedFhem.displayTarget}).
                    </span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDraft((p) => ({...p, mode: 'local_instance', useServerUpstream: false}))}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-colors ${
                    draft.mode === 'local_instance' && !draft.useServerUpstream
                      ? 'border-[var(--accent-ring)] theme-tonal'
                      : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="text-sm font-semibold">
                    Integrierte FHEM-Testinstanz
                  </span>
                  <span className="mt-1 text-xs opacity-80">
                    201 Geräte (108 ZigBee), voll funktionsfähige set/get/attr/define/save-Engine.
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setDraft((p) => ({...p, mode: 'remote_server', useServerUpstream: false}))}
                  className={`flex flex-col items-start rounded-2xl border p-4 text-left transition-colors ${
                    draft.mode === 'remote_server' && !draft.useServerUpstream
                      ? 'border-[var(--accent-ring)] theme-tonal'
                      : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="text-sm font-semibold">
                    Eigener FHEM-Server (Manuell)
                  </span>
                  <span className="mt-1 text-xs opacity-80">
                    FHEMWEB, Reverse Proxy oder eigene API — mit frei wählbarer Authentifizierung und CSRF-Modus.
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* FHEM Connection Setup Wizard: Interface, Endpoint, Auth & CSRF */}
          <div className="rounded-2xl border theme-surface p-5 space-y-6">
            {!(authStatus.managedFhem?.exclusive || draft.useServerUpstream) && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                      FHEM Verbindungs-Setup
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Wähle Schnittstelle, Authentifizierung und CSRF-Verhalten passend zu deinem FHEM-Server.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowSecrets((s) => !s)}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-[#1B222D] shrink-0"
                  >
                    {showSecrets ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showSecrets ? 'Verbergen' : 'Anzeigen'}
                  </button>
                </div>

            {/* Step 1: API Interface Selection */}
            <div className="space-y-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                1. Welche Schnittstelle nutzt dein FHEM-Server?
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {(
                  [
                    {
                      id: 'fhemweb' as FhemApiInterface,
                      title: 'FHEMWEB Standard',
                      desc: 'GET /fhem?cmd=...&XHR=1 (Port 8083)',
                    },
                    {
                      id: 'reverse_proxy' as FhemApiInterface,
                      title: 'Reverse Proxy (HTTPS)',
                      desc: 'Nginx / Caddy / Traefik / DynDNS (Port 443)',
                    },
                    {
                      id: 'fhemweb_post' as FhemApiInterface,
                      title: 'FHEMWEB POST',
                      desc: 'POST /fhem mit Form-Body (lange Befehle)',
                    },
                    {
                      id: 'custom_api' as FhemApiInterface,
                      title: 'Eigene API / Gateway',
                      desc: 'Freier Pfad, eigene Header oder Query-Token',
                    },
                  ] as const
                ).map((item) => {
                  const selected = draft.apiInterface === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => applyInterfacePreset(item.id)}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[var(--accent-ring)] theme-tonal'
                          : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-xs font-semibold">{item.title}</span>
                      <span className="mt-1 text-[11px] opacity-80 leading-snug">{item.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Endpoint & Transport */}
            <div className="space-y-3 border-t theme-border pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                2. Serveradresse & Verbindungsweg
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Protokoll
                  </label>
                  <select
                    value={draft.protocol}
                    onChange={(e) => {
                      const nextProto = e.target.value as 'http' | 'https';
                      setDraft((p) => ({
                        ...p,
                        protocol: nextProto,
                        port:
                          nextProto === 'https' && p.port === 8083
                            ? 443
                            : nextProto === 'http' && p.port === 443
                              ? 8083
                              : p.port,
                      }));
                    }}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  >
                    <option value="http">HTTP</option>
                    <option value="https">HTTPS</option>
                  </select>
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Host / Domain / IP (volle URL einfügbar)
                  </label>
                  <input
                    type="text"
                    value={draft.host}
                    onChange={(e) => handleHostInputChange(e.target.value)}
                    placeholder="fhem.meinedomain.de oder 192.168.178.50"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={65535}
                    value={draft.port}
                    onChange={(e) => setDraft((p) => ({...p, port: Number(e.target.value) || 8083}))}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 font-mono text-sm tabular-nums text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Pfad & Methode
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      value={draft.basePath}
                      onChange={(e) => setDraft((p) => ({...p, basePath: e.target.value}))}
                      placeholder="/fhem"
                      className="min-h-[44px] min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2.5 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                    <select
                      value={draft.httpMethod}
                      onChange={(e) => setDraft((p) => ({...p, httpMethod: e.target.value as 'GET' | 'POST'}))}
                      aria-label="HTTP-Methode"
                      className="min-h-[44px] w-[72px] shrink-0 rounded-xl border border-slate-300 bg-white px-2 font-mono text-xs font-semibold text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({...p, transport: 'proxy'}))}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                    draft.transport === 'proxy'
                      ? 'border-[var(--accent-ring)] theme-tonal'
                      : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="text-xs font-semibold">Server-Proxy (kein CORS nötig)</span>
                  <span className="mt-0.5 text-[11px] opacity-80">
                    Für Domains, DynDNS & HTTPS Reverse Proxys (unterstützt Self-Signed Zertifikate).
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({...p, transport: 'direct'}))}
                  className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                    draft.transport === 'direct'
                      ? 'border-[var(--accent-ring)] theme-tonal'
                      : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="text-xs font-semibold">Direktverbindung vom Gerät (LAN)</span>
                  <span className="mt-0.5 text-[11px] opacity-80">
                    Für lokale Heimnetz-IPs (192.168.x.x). Benötigt in FHEM meist <code className="font-mono">attr WEB CORS 1</code>.
                  </span>
                </button>
              </div>

              {/* Proactive Network / Mixed-Content Guidance */}
              {draft.mode === 'remote_server' && draft.transport === 'proxy' && looksLikePrivateLanHost && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-2xl border border-amber-400/50 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Hinweis zur LAN-Adresse ({draft.host}):</strong> Der Server-Proxy kann private Heimnetz-IPs nicht erreichen. Nutze entweder deine öffentliche DynDNS/Reverse-Proxy-Domain oder schalte auf „Direktverbindung (LAN)“ um.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDraft((p) => ({...p, transport: 'direct'}))}
                    className="min-h-[36px] shrink-0 rounded-xl bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700 whitespace-nowrap"
                  >
                    Auf Direktverbindung wechseln
                  </button>
                </div>
              )}

              {isHttpsPageWithHttpDirect && (
                <div className="space-y-3 rounded-2xl border border-amber-400/50 bg-amber-500/10 px-4 py-3.5 text-xs text-amber-900 dark:text-amber-200">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold">
                        Mixed-Content-Blockade: HTTPS-App darf kein unverschlüsseltes HTTP direkt aufrufen
                      </div>
                      <p className="opacity-90 leading-relaxed">
                        Da diese Web-App über <strong>HTTPS</strong> geöffnet ist, blockiert der Browser aus Sicherheitsgründen direkte <code className="font-mono">http://</code>-Anfragen an dein Heimnetz. Das lässt sich schnell lösen:
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 pl-6">
                    <div className="rounded-xl bg-black/5 dark:bg-black/25 p-2.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-[11px]">
                          Lösung 1 (Heimnetz): In FHEM HTTPS + CORS aktivieren
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const snippet = 'attr WEB HTTPS 1; attr WEB CORS 1; save';
                            void navigator.clipboard?.writeText(snippet).then(() => {
                              setCopiedFhemSnippet(true);
                              window.setTimeout(() => setCopiedFhemSnippet(false), 2000);
                            });
                          }}
                          className="flex min-h-[30px] items-center gap-1 rounded-lg bg-amber-600/20 px-2 text-[11px] font-semibold hover:bg-amber-600/30"
                        >
                          {copiedFhemSnippet ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          {copiedFhemSnippet ? 'Kopiert' : 'FHEM-Befehl kopieren'}
                        </button>
                      </div>
                      <code className="block font-mono text-[11px] select-all">
                        attr WEB HTTPS 1; attr WEB CORS 1; save
                      </code>
                      <p className="text-[11px] opacity-85">
                        Danach einmal{' '}
                        <a
                          href={`https://${draft.host || '192.168.178.50'}:${draft.port || 8083}${draft.basePath.startsWith('/') ? draft.basePath : `/${draft.basePath || 'fhem'}`}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 font-mono underline hover:opacity-80"
                        >
                          https://{draft.host || '192.168.178.50'}:{draft.port || 8083}
                          <ExternalLink className="h-3 w-3" />
                        </a>{' '}
                        im Browser öffnen, das Zertifikat akzeptieren und unten auf <strong>HTTPS</strong> umschalten.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const nextDraft: FhemConnectionConfig = {
                            ...draft,
                            protocol: 'https',
                            acceptSelfSigned: true,
                          };
                          setDraft(nextDraft);
                        }}
                        className="min-h-[36px] rounded-xl bg-amber-600 px-3 text-xs font-semibold text-white hover:bg-amber-700"
                      >
                        Auf HTTPS umstellen (Port {draft.port || 8083})
                      </button>
                      <button
                        type="button"
                        onClick={() => applyInterfacePreset('reverse_proxy')}
                        className="min-h-[36px] rounded-xl border border-amber-500/50 px-3 text-xs font-semibold hover:bg-amber-500/15"
                      >
                        Reverse Proxy (HTTPS + Proxy) wählen
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 3: Authentication Method Selector */}
            <div className="space-y-3 border-t theme-border pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                3. Wie möchtest du dich authentifizieren?
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                {(
                  [
                    {id: 'basic' as FhemAuthType, title: 'HTTP Basic Auth', sub: 'Benutzer & Passwort'},
                    {id: 'none' as FhemAuthType, title: 'Keine Auth', sub: 'Offenes FHEMWEB'},
                    {id: 'apikey' as FhemAuthType, title: 'API-Key / Bearer', sub: 'Authorization Header'},
                    {id: 'custom_header' as FhemAuthType, title: 'Custom Header', sub: 'z. B. X-API-Key'},
                    {id: 'query_token' as FhemAuthType, title: 'URL-Token', sub: 'Query-Parameter'},
                  ] as const
                ).map((auth) => {
                  const selected = draft.authType === auth.id;
                  return (
                    <button
                      key={auth.id}
                      type="button"
                      onClick={() => setDraft((p) => ({...p, authType: auth.id}))}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[var(--accent-ring)] theme-tonal'
                          : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-xs font-semibold">{auth.title}</span>
                      <span className="mt-0.5 text-[11px] opacity-80">{auth.sub}</span>
                    </button>
                  );
                })}
              </div>

              {draft.authType === 'basic' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Benutzername (Basic Auth)
                    </label>
                    <input
                      type="text"
                      autoComplete="username"
                      value={draft.username}
                      onChange={(e) => setDraft((p) => ({...p, username: e.target.value}))}
                      placeholder="z. B. fhemadmin"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Passwort (Basic Auth)
                    </label>
                    <input
                      type={showSecrets ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={draft.password}
                      onChange={(e) => setDraft((p) => ({...p, password: e.target.value}))}
                      placeholder="••••••••"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                  </div>
                </div>
              )}

              {draft.authType === 'apikey' && (
                <div className="pt-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    API-Key / Bearer Token (wird als <code className="font-mono">Authorization: Bearer …</code> gesendet)
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={draft.apiKey}
                    onChange={(e) => setDraft((p) => ({...p, apiKey: e.target.value}))}
                    placeholder="sk-... oder Reverse-Proxy Bearer Token"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  />
                </div>
              )}

              {draft.authType === 'custom_header' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Header-Name
                    </label>
                    <input
                      type="text"
                      value={draft.customHeaderName}
                      onChange={(e) => setDraft((p) => ({...p, customHeaderName: e.target.value}))}
                      placeholder="z. B. X-API-Key oder X-Auth-Token"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Header-Wert / Secret
                    </label>
                    <input
                      type={showSecrets ? 'text' : 'password'}
                      value={draft.customHeaderValue}
                      onChange={(e) => setDraft((p) => ({...p, customHeaderValue: e.target.value}))}
                      placeholder="••••••••"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                  </div>
                </div>
              )}

              {draft.authType === 'query_token' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Query-Parameter-Name
                    </label>
                    <input
                      type="text"
                      value={draft.queryTokenParam}
                      onChange={(e) => setDraft((p) => ({...p, queryTokenParam: e.target.value}))}
                      placeholder="z. B. token oder apikey"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                      Token-Wert
                    </label>
                    <input
                      type={showSecrets ? 'text' : 'password'}
                      value={draft.queryTokenValue}
                      onChange={(e) => setDraft((p) => ({...p, queryTokenValue: e.target.value}))}
                      placeholder="••••••••"
                      className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Step 4: FHEM CSRF Token Strategy */}
            <div className="space-y-3 border-t theme-border pt-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                4. FHEM CSRF-Token (fwcsrf)
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {(
                  [
                    {
                      id: 'none' as FhemCsrfMode,
                      title: 'Ohne CSRF-Token',
                      desc: 'Für „attr WEB csrfToken none“ oder reine Basic-Auth-Zugänge.',
                    },
                    {
                      id: 'auto' as FhemCsrfMode,
                      title: 'Automatisch erkennen',
                      desc: 'Liest X-FHEM-csrfToken bei Bedarf automatisch vom FHEM-Server.',
                    },
                    {
                      id: 'manual' as FhemCsrfMode,
                      title: 'Manuelles CSRF-Token',
                      desc: 'Sendet dein fest definiertes fwcsrf-Token bei jedem Befehl mit.',
                    },
                  ] as const
                ).map((mode) => {
                  const selected = draft.csrfMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setDraft((p) => ({...p, csrfMode: mode.id}))}
                      className={`flex flex-col items-start rounded-xl border p-3 text-left transition-colors ${
                        selected
                          ? 'border-[var(--accent-ring)] theme-tonal'
                          : 'theme-border hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                      }`}
                    >
                      <span className="text-xs font-semibold">{mode.title}</span>
                      <span className="mt-0.5 text-[11px] opacity-80 leading-snug">{mode.desc}</span>
                    </button>
                  );
                })}
              </div>

              {draft.csrfMode === 'manual' && (
                <div className="pt-1">
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    FHEM CSRF-Token (fwcsrf)
                  </label>
                  <input
                    type={showSecrets ? 'text' : 'password'}
                    value={draft.csrfToken}
                    onChange={(e) => setDraft((p) => ({...p, csrfToken: e.target.value}))}
                    placeholder="z. B. csrf_1234567890"
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  />
                </div>
              )}
            </div>

              </>
            )}

            {/* Echtzeit-Updates (FHEMWEB Longpoll) + Polling & Timeout */}
            <div
              className={
                authStatus.managedFhem?.exclusive || draft.useServerUpstream
                  ? 'space-y-3'
                  : 'space-y-3 border-t theme-border pt-4'
              }
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {authStatus.managedFhem?.exclusive || draft.useServerUpstream
                  ? 'Echtzeit-Aktualisierung (Longpoll, Polling & Timeout)'
                  : '5. Echtzeit-Aktualisierung (Longpoll & Polling)'}
              </div>

              <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4 rounded-2xl theme-surface-alt px-4 py-3 border theme-border">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    FHEMWEB Longpoll (Echtzeit-Events)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    Empfängt Status- und Reading-Änderungen sofort über <code className="font-mono">inform=type=status;fmt=JSON</code> ohne ständiges Neuladen. Auto-Polling dient automatisch als Fallback.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draft.longpollEnabled}
                  onChange={(e) => setDraft((p) => ({...p, longpollEnabled: e.target.checked}))}
                  className="h-5 w-5 shrink-0 rounded accent-[var(--accent-primary)]"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Auto-Polling Intervall {draft.longpollEnabled ? '(Fallback / Abgleich)' : ''}
                  </label>
                  <select
                    value={draft.pollIntervalSec}
                    onChange={(e) => setDraft((p) => ({...p, pollIntervalSec: Number(e.target.value)}))}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  >
                    <option value={0}>Aus (nur manuell / Longpoll)</option>
                    <option value={5}>Alle 5 Sekunden</option>
                    <option value={15}>Alle 15 Sekunden</option>
                    <option value={30}>Alle 30 Sekunden</option>
                    <option value={60}>Alle 60 Sekunden</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    HTTP-Timeout (ms)
                  </label>
                  <input
                    type="number"
                    min={1500}
                    max={30000}
                    step={500}
                    value={draft.timeoutMs}
                    onChange={(e) => setDraft((p) => ({...p, timeoutMs: Number(e.target.value) || 8000}))}
                    className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-sm tabular-nums text-slate-900 dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                  />
                </div>
              </div>
            </div>

            {!(authStatus.managedFhem?.exclusive || draft.useServerUpstream) && draft.protocol === 'https' && (
              <label className="flex min-h-[48px] cursor-pointer items-center justify-between gap-4 rounded-2xl theme-surface-alt px-4 py-3 border theme-border">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Self-Signed SSL-Zertifikate akzeptieren
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Optional für Reverse-Proxys (Nginx/Caddy) oder FHEMWEB HTTPS mit selbstsigniertem Zertifikat im Server-Proxy-Modus.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={draft.acceptSelfSigned}
                  onChange={(e) => setDraft((p) => ({...p, acceptSelfSigned: e.target.checked}))}
                  className="h-5 w-5 rounded accent-[var(--accent-primary)]"
                />
              </label>
            )}

            {/* URL Pattern Preview */}
            {!(authStatus.managedFhem?.exclusive || draft.useServerUpstream) && (
              <div className="rounded-2xl theme-surface-alt px-3.5 py-2.5 border theme-border">
                <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  FHEMWEB Anfrage-Muster ({draft.httpMethod} ·{' '}
                  {draft.authType === 'basic'
                    ? 'HTTP Basic Auth'
                    : draft.authType === 'apikey'
                      ? 'Bearer Header'
                      : draft.authType === 'custom_header'
                        ? `Header ${draft.customHeaderName || 'Custom'}`
                        : draft.authType === 'query_token'
                          ? `Query ?${draft.queryTokenParam || 'token'}`
                          : 'Ohne Auth'}{' '}
                  ·{' '}
                  {draft.csrfMode === 'manual'
                    ? 'Manuelles CSRF'
                    : draft.csrfMode === 'auto'
                      ? 'CSRF Automatisch'
                      : 'Ohne CSRF'}
                  )
                </div>
                <code className="mt-1 block break-all font-mono text-xs theme-text">
                  {endpointPreview}
                </code>
              </div>
            )}

            {/* Live Diagnostic Feedback */}
            {testFeedback && (
              <div
                className={`space-y-2 rounded-2xl px-4 py-3 text-xs ${
                  testFeedback.ok
                    ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                    : 'bg-red-500/12 text-red-700 dark:text-red-300'
                }`}
              >
                <div className="flex items-start gap-2.5 font-semibold">
                  {testFeedback.ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  )}
                  <span>
                    {testFeedback.message}
                    {testFeedback.statusCode && !testFeedback.ok ? ` [HTTP ${testFeedback.statusCode}]` : ''}
                  </span>
                </div>
                {testFeedback.diagnosticHint && (
                  <p className="pl-6.5 opacity-90 leading-relaxed">{testFeedback.diagnosticHint}</p>
                )}
                {!testFeedback.ok && testFeedback.errorCode === 'CSRF_REQUIRED' && (
                  <div className="flex flex-wrap gap-2 pl-6.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const nextDraft: FhemConnectionConfig = {...draft, csrfMode: 'auto'};
                        setDraft(nextDraft);
                        void handleTest(nextDraft);
                      }}
                      className="min-h-[36px] rounded-xl bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      CSRF auf „Automatisch“ stellen & erneut testen
                    </button>
                    {testFeedback.csrfToken && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextDraft: FhemConnectionConfig = {
                            ...draft,
                            csrfMode: 'manual',
                            csrfToken: testFeedback.csrfToken || '',
                          };
                          setDraft(nextDraft);
                          void handleTest(nextDraft);
                        }}
                        className="min-h-[36px] rounded-xl border border-red-400/50 px-3 text-xs font-semibold hover:bg-red-500/10"
                      >
                        Erkanntes Token übernehmen & testen
                      </button>
                    )}
                  </div>
                )}
                {!testFeedback.ok && testFeedback.errorCode === 'MIXED_CONTENT' && (
                  <div className="flex flex-wrap gap-2 pl-6.5 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const nextDraft: FhemConnectionConfig = {
                          ...draft,
                          protocol: 'https',
                          acceptSelfSigned: true,
                        };
                        setDraft(nextDraft);
                        void handleTest({...nextDraft, mode: 'remote_server'});
                      }}
                      className="min-h-[36px] rounded-xl bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Mit HTTPS testen (Port {draft.port || 8083})
                    </button>
                    <a
                      href={`https://${draft.host || '192.168.178.50'}:${draft.port || 8083}${draft.basePath.startsWith('/') ? draft.basePath : `/${draft.basePath || 'fhem'}`}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-red-400/50 px-3 text-xs font-semibold hover:bg-red-500/10"
                    >
                      FHEM HTTPS-Zertifikat im Browser öffnen
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => void handleTest({...draft, mode: 'remote_server'})}
                disabled={testing}
                className="flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 dark:border-[#2A3444] dark:bg-[#1B222D] dark:text-slate-100"
              >
                <Wifi className={`h-4 w-4 ${testing ? 'animate-pulse' : ''}`} />
                {testing ? 'Teste FHEM-Server...' : 'FHEM-Verbindung testen'}
              </button>

              <button
                type="submit"
                disabled={saving}
                className="flex min-h-[44px] items-center gap-2 rounded-xl theme-btn-primary px-5 text-xs font-semibold disabled:opacity-60 transition-colors"
              >
                <Lock className="h-4 w-4" />
                {saving ? 'Verschlüsselt speichern...' : 'Verschlüsselt speichern'}
              </button>
            </div>
          </div>

          {/* Local Encrypted Keystore Info */}
          <div className="rounded-2xl border theme-surface p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
                <KeyRound className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Lokaler Schlüsselspeicher ({keystoreEncrypted ? 'AES-256-GCM aktiv' : 'Basis-Speicher'})
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Serveradresse, Port, Zugangsdaten, API-Keys, Custom-Header und optionale CSRF-Tokens werden lokal auf diesem Gerät mit einem nicht-exportierbaren Geräteschlüssel (Web Crypto Keystore + IndexedDB) verschlüsselt gespeichert.
                </p>
                {keystoreUpdatedAt && (
                  <div className="mt-2 font-mono text-[11px] tabular-nums text-slate-400">
                    Zuletzt verschlüsselt gespeichert: {new Date(keystoreUpdatedAt).toLocaleString('de-DE')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </form>
      )}

      {/* SECTION 2: SERVER ADMINISTRATION & CONSOLE */}
      {section === 'admin' && (
        <div className="space-y-5">
          {/* Quick Server Actions */}
          <div className="rounded-2xl border theme-surface p-5 space-y-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                FHEM Server-Verwaltung
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kritische Aktionen (define, delete, restart, shutdown) werden erst nach zusätzlicher Sicherheitsbestätigung ausgeführt.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onSaveFhemCfg}
                className={`flex min-h-[60px] items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                  status.unsavedChanges
                    ? 'border-amber-400 bg-amber-500/10 hover:bg-amber-500/15'
                    : 'border-slate-200/80 bg-slate-50 hover:bg-slate-100 dark:border-[#242D3B] dark:bg-[#0E1116] dark:hover:bg-[#1B222D]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Save className={`h-5 w-5 ${status.unsavedChanges ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Konfiguration speichern (save)
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {status.unsavedChanges ? 'Ungespeicherte Änderungen vorhanden' : 'fhem.cfg ist aktuell'}
                    </div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={onOpenDefineModal}
                className="flex min-h-[60px] items-center gap-3 rounded-2xl border theme-border theme-surface-alt px-4 py-3 text-left hover:opacity-90 transition-opacity"
              >
                <PlusCircle className="h-5 w-5 theme-text shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Neues Device definieren (define)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    MQTT2, HUEDevice, at, DOIF, notify, watchdog
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={onRequestRestartFhem}
                className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-red-200/90 bg-red-500/5 px-4 py-3 text-left hover:bg-red-500/12 dark:border-red-500/30"
              >
                <RotateCcw className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                    FHEM neu starten (shutdown restart)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Startet den FHEM-Dienst kontrolliert neu
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={onRequestShutdownFhem}
                className="flex min-h-[60px] items-center gap-3 rounded-2xl border border-red-200/90 bg-red-500/5 px-4 py-3 text-left hover:bg-red-500/12 dark:border-red-500/30"
              >
                <PowerOff className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-red-700 dark:text-red-300">
                    FHEM herunterfahren (shutdown)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Beendet den FHEM-Prozess vollständig
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Direct FHEM Command Console */}
          <div className="rounded-2xl border theme-surface p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                FHEM Befehlszeile (FHEMWEB)
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {['version', 'uptime', 'list HUEDevice_WZ_Decke', 'get ZB_Sensor_WZ_Klima temperature'].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => runConsole(preset)}
                    className="min-h-[34px] rounded-lg theme-surface-alt px-2.5 font-mono text-[11px] font-medium text-slate-700 hover:opacity-85 dark:text-slate-300"
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void runConsole();
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={consoleCmd}
                onChange={(e) => setConsoleCmd(e.target.value)}
                placeholder="z. B. list, jsonlist2 ZB_.*, set HUEDevice_WZ_Decke on"
                className="min-h-[44px] flex-1 rounded-xl border theme-border bg-white px-3.5 font-mono text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
              />
              <button
                type="submit"
                disabled={consoleRunning}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl theme-btn-primary px-4 text-xs font-semibold disabled:opacity-60 whitespace-nowrap transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Ausführen
              </button>
            </form>

            {consoleUrlPreview && (
              <div className="rounded-xl theme-surface-alt px-3 py-2 font-mono text-[11px] break-all text-slate-500 dark:text-slate-400">
                GET {consoleUrlPreview}
              </div>
            )}

            <pre className="max-h-72 overflow-auto rounded-2xl bg-[#0B0E14] p-4 font-mono text-xs leading-relaxed text-slate-200">
              {consoleOutput || 'Gib einen FHEM-Befehl ein (z. B. version, list, get <device> <reading>, set <device> on)...'}
            </pre>
          </div>
        </div>
      )}

      {/* SECTION 3: EVENT MONITOR & LOGFILE */}
      {section === 'logs' && (
        <div className="rounded-2xl border theme-surface p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-[#0E1116]">
              <button
                type="button"
                onClick={() => setMonitorTab('events')}
                className={`min-h-[38px] rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                  monitorTab === 'events'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-[#1B222D] dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Event-Monitor ({events.length})
              </button>
              <button
                type="button"
                onClick={() => setMonitorTab('logfile')}
                className={`min-h-[38px] rounded-lg px-3.5 text-xs font-semibold transition-colors ${
                  monitorTab === 'logfile'
                    ? 'bg-white text-slate-900 shadow-xs dark:bg-[#1B222D] dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Logfile ({logs.length})
              </button>
            </div>

            {monitorTab === 'events' ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onToggleEventsPaused}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200"
                >
                  {eventsPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {eventsPaused ? 'Fortsetzen' : 'Pausieren'}
                </button>
                <button
                  type="button"
                  onClick={onClearEvents}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Leeren
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onReloadLogs()}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Logfile aktualisieren
              </button>
            )}
          </div>

          {monitorTab === 'events' ? (
            <>
              <input
                type="text"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                placeholder="Events filtern (z. B. ZB_, temperature, DOIF, pct)..."
                className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-3.5 font-mono text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
              />
              <div className="max-h-[440px] overflow-y-auto rounded-2xl bg-[#0B0E14] p-3 font-mono text-xs divide-y divide-slate-800/70">
                {filteredEvents.length === 0 ? (
                  <div className="py-8 text-center text-slate-500">Keine Events vorhanden.</div>
                ) : (
                  filteredEvents.map((ev) => (
                    <div key={ev.id} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3 py-2">
                      <span className="text-[11px] tabular-nums text-slate-500 shrink-0">{ev.timestamp}</span>
                      <span className="text-blue-400 shrink-0">{ev.deviceType}</span>
                      <span className="font-semibold text-slate-100 shrink-0">{ev.device}</span>
                      <span
                        className={`break-all ${
                          ev.level === 'error'
                            ? 'text-red-400'
                            : ev.level === 'warn'
                              ? 'text-amber-300'
                              : 'text-emerald-300'
                        }`}
                      >
                        {ev.event}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={logSearch}
                  onChange={(e) => setLogSearch(e.target.value)}
                  placeholder="Logfile durchsuchen..."
                  className="min-h-[44px] flex-1 rounded-xl border border-slate-300 bg-white px-3.5 text-xs text-slate-900 focus:border-blue-500 focus:outline-none dark:border-[#2A3444] dark:bg-[#0E1116] dark:text-slate-100"
                />
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      {id: 'all', label: 'Alle Level'},
                      {id: 'warn', label: 'Warnung (≤3)'},
                      {id: 'error', label: 'Fehler (≤2)'},
                    ] as const
                  ).map((lvl) => (
                    <button
                      key={lvl.id}
                      type="button"
                      onClick={() => setLogLevelFilter(lvl.id)}
                      className={`min-h-[44px] rounded-xl px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
                        logLevelFilter === lvl.id
                          ? 'theme-btn-primary'
                          : 'theme-surface-alt text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {lvl.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="max-h-[440px] overflow-y-auto rounded-2xl bg-[#0B0E14] p-3 font-mono text-xs divide-y divide-slate-800/70">
                {filteredLogs.map((l) => (
                  <div key={l.id} className="py-2 space-y-0.5">
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span className="tabular-nums">{l.timestamp}</span>
                      <span
                        className={`font-semibold ${
                          l.level <= 1 ? 'text-red-400' : l.level === 2 ? 'text-amber-400' : 'text-blue-400'
                        }`}
                      >
                        Level {l.level}
                      </span>
                      <span className="text-slate-300">[{l.source}]</span>
                    </div>
                    <div className="text-slate-200 leading-relaxed">{l.message}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* SECTION 4: DESIGN, THEMES, PWA & LOCAL DATA */}
      {section === 'app' && (
        <div className="space-y-4">
          {/* Device-Dependent View Mode (Auto / Mobile / Desktop) */}
          <div className="rounded-2xl border theme-surface p-5 space-y-3.5">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Geräteabhängige Ansicht (Mobil & Desktop)
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Wähle zwischen automatischer Geräteerkennung oder einer fest eingestellten Oberfläche für Smartphone bzw. Desktop-Browser.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {(
                [
                  {
                    id: 'auto' as ViewMode,
                    title: 'Automatisch',
                    desc: 'Mobilansicht auf Smartphones (< 1024 px), volle Seitenleiste im Desktop-Browser.',
                    icon: Smartphone,
                  },
                  {
                    id: 'mobile' as ViewMode,
                    title: 'Mobilansicht',
                    desc: 'Kompakter Header, untere Tab-Leiste & einspaltige Touch-Kacheln.',
                    icon: Smartphone,
                  },
                  {
                    id: 'desktop' as ViewMode,
                    title: 'Desktop-Ansicht',
                    desc: 'Permanente linke Seitenleiste, Top-Bar & mehrspaltiges Dashboard.',
                    icon: Monitor,
                  },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const active = (preferences.viewMode || 'auto') === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onUpdatePreferences({viewMode: option.id})}
                    className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-colors ${
                      active
                        ? 'border-[var(--accent-ring)] theme-tonal'
                        : 'theme-border bg-[var(--m3-canvas)]/70 hover:border-[var(--accent-ring)]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                        <Icon className="h-4 w-4 theme-text shrink-0" />
                        <span>{option.title}</span>
                      </span>
                      {active && <Check className="h-4 w-4 theme-text shrink-0" />}
                    </div>
                    <span className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                      {option.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border theme-surface p-5 space-y-5">
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Design & Farbthemes
            </h2>

            <ThemeGallery
              mode={preferences.theme}
              colorTheme={preferences.colorTheme}
              onSelectMode={(mode) => onUpdatePreferences({theme: mode})}
              onSelectColorTheme={(id) => onUpdatePreferences({colorTheme: id})}
            />

            <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4 border-t theme-border pt-4">
              <div className="flex items-center gap-3">
                <Radio className="h-4.5 w-4.5 theme-text shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    ZigBee-Funkqualität (LQI) & Batterie auf Kacheln anzeigen
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Zeigt Verbindungsqualität und Batteriestand direkt in der Kachel-Fußzeile.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.showZigbeeMetrics}
                onChange={(e) => onUpdatePreferences({showZigbeeMetrics: e.target.checked})}
                className="h-5 w-5 rounded accent-[var(--accent-primary)]"
              />
            </label>

            <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4 border-t theme-border pt-4">
              <div className="flex items-center gap-3">
                <ImageIcon className="h-4.5 w-4.5 theme-text shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Raumbilder, Gerätefotos & visuelle Grafiken anzeigen
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Zeigt passende Raumfotos, SVG-Telemetrieringe und eigene Bilder auf Dashboard & Raumansicht.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.showVisuals}
                onChange={(e) => onUpdatePreferences({showVisuals: e.target.checked})}
                className="h-5 w-5 rounded accent-[var(--accent-primary)]"
              />
            </label>

            <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-4 border-t theme-border pt-4">
              <div className="flex items-center gap-3">
                <Rows3 className="h-4.5 w-4.5 theme-text shrink-0" />
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Kompakte Wand-Tablet-Kacheln (EasyTiley-Dichte)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Zeigt mehr Geräte gleichzeitig auf dem Dashboard mit reduzierter Kachelhöhe.
                  </div>
                </div>
              </div>
              <input
                type="checkbox"
                checked={preferences.compactCards}
                onChange={(e) => onUpdatePreferences({compactCards: e.target.checked})}
                className="h-5 w-5 rounded accent-[var(--accent-primary)]"
              />
            </label>
          </div>

          {/* Room Photos, Device Images & Floorplan Manager */}
          <div className="rounded-2xl border theme-surface p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                  Raumbilder, Grafiken & Grundriss
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Lade eigene Fotos deiner Räume, einen Haus-Grundriss oder individuelle Gerätebilder hoch — lokal gespeichert & automatisch optimiert.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onOpenMediaPicker({kind: 'floorplan', key: 'floorplan', label: 'Haus-Grundriss'})
                }
                className="flex min-h-[42px] items-center gap-1.5 rounded-xl theme-tonal px-3.5 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
              >
                <ImagePlus className="h-4 w-4" />
                {customMedia.floorplan ? 'Grundriss ändern' : 'Grundriss / Hausbild hochladen'}
              </button>
            </div>

            {customMedia.floorplan && (
              <div className="relative h-40 w-full overflow-hidden rounded-2xl border theme-border">
                <SmartVisualImage
                  src={customMedia.floorplan}
                  alt="Haus-Grundriss Vorschau"
                  label="Grundriss"
                  className="h-full w-full"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between text-white">
                  <span className="text-xs font-semibold">Aktiver Haus-Grundriss (wird im Dashboard angezeigt)</span>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenMediaPicker({kind: 'floorplan', key: 'floorplan', label: 'Haus-Grundriss'})
                    }
                    className="rounded-lg bg-black/60 px-2.5 py-1 text-[11px] font-semibold hover:bg-black/80"
                  >
                    Ändern
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {detectedRooms.map((roomName) => {
                const resolved = resolveRoomImage(roomName, customMedia);
                return (
                  <button
                    key={roomName}
                    type="button"
                    onClick={() => onOpenMediaPicker({kind: 'room', key: roomName, label: roomName})}
                    className="group relative overflow-hidden rounded-2xl border theme-border text-left transition-all hover:border-[var(--accent-ring)]"
                  >
                    <div className="aspect-[16/10] w-full overflow-hidden">
                      <SmartVisualImage
                        src={resolved.src}
                        alt={`Raumbild ${roomName}`}
                        label={roomName}
                        className="h-full w-full"
                        imgClassName="transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                    <div className="absolute bottom-2 left-2.5 right-2.5 text-white">
                      <div className="truncate text-xs font-semibold">{roomName}</div>
                      <div className="text-[10px] text-white/80">
                        {resolved.isCustom
                          ? 'Eigenes Bild'
                          : resolved.src
                            ? 'Standard-Raumfoto'
                            : 'Vektor-Grafik · Bild wählen'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Gerätebilder kannst du direkt in den Gerätedetails (Foto-Symbol oben rechts) hinzufügen oder in FHEM per{' '}
              <code className="font-mono">attr &lt;Device&gt; appOptions {`{"image":"https://..."}`}</code> hinterlegen.
            </p>
          </div>

          {/* OpenAI-compatible AI Assistant Setup Shortcut */}
          <div className="rounded-2xl border theme-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <Sparkles className="h-5 w-5 theme-text shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  KI-Assistent (OpenAI-kompatibler Endpunkt & Commandref)
                </h3>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Eigene API-URL (OpenAI, OpenRouter, Groq, Ollama/LM Studio) und verschlüsselten Key konfigurieren.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenAiAssistant}
              className="min-h-[44px] rounded-xl theme-tonal px-4 text-xs font-semibold hover:opacity-90 whitespace-nowrap"
            >
              KI-Assistent öffnen
            </button>
          </div>

          {/* Android / PWA Installability */}
          <div className="rounded-2xl border theme-surface p-5 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 theme-text shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Mobile Installation (Android & iOS)
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Installiere FHEM Control Desk direkt auf dem Startbildschirm als eigenständige App mit Offline-Cache.
                </p>
              </div>
            </div>
            <div className="pt-1">
              <PWAInstallButton variant="card" />
            </div>
          </div>

          {/* Reset Local Data */}
          <div className="rounded-2xl border theme-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Lokale App-Daten zurücksetzen
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Löscht verschlüsselte Serverdaten, Favoriten und setzt die lokale Test-Instanz zurück.
              </p>
            </div>
            <button
              type="button"
              onClick={onRequestResetLocalData}
              className="min-h-[44px] rounded-xl border border-red-300 px-4 text-xs font-semibold text-red-600 hover:bg-red-500/10 dark:border-red-500/40 dark:text-red-400 whitespace-nowrap"
            >
              Zurücksetzen
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
