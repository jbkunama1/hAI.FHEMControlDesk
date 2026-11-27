import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, X} from 'lucide-react';
import type {
  ActiveTab,
  AiAssistantConfig,
  AppPreferences,
  AuthStatus,
  ChartTarget,
  CommandExecutionResult,
  ConnectionStatus,
  CustomMediaStore,
  FhemConnectionConfig,
  FhemDevice,
  FhemEventItem,
  FhemLogEntry,
  ManagedFhemInfo,
  MediaPickerTarget,
  TileSize,
  UserAccount,
} from './types/fhem';
import {
  clearAllLocalData,
  DEFAULT_AI_CONFIG,
  DEFAULT_CONNECTION_CONFIG,
  DEFAULT_CUSTOM_MEDIA,
  DEFAULT_PREFERENCES,
  loadCustomMedia,
  loadEncryptedAiConfig,
  loadEncryptedConnectionConfig,
  loadPreferences,
  saveCustomMedia,
  saveEncryptedAiConfig,
  saveEncryptedConnectionConfig,
  savePreferences,
} from './lib/secureStorage';
import {
  fetchAuthStatus,
  fetchSyncedProfile,
  logoutAccount,
  saveSyncedProfile,
} from './lib/profileClient';
import {
  applyLongpollUpdateToDevices,
  executeFhemCommand,
  extractSchedulesFromDevices,
  fetchAllFhemDevices,
  localFhemEngine,
  startFhemLongpoll,
} from './lib/fhemClient';
import {resolveDeviceImage, resolveRoomImage} from './lib/roomVisuals';
import {isDeviceChartable} from './lib/sensorHistory';
import {useDeviceViewport} from './hooks/useDeviceViewport';
import {AppHeader} from './components/AppHeader';
import {BottomNav, type SidebarRoomItem} from './components/BottomNav';
import {MobileHeader} from './components/MobileHeader';
import {MobileBottomNav} from './components/MobileBottomNav';
import {DashboardView} from './components/DashboardView';
import {RoomsView} from './components/RoomsView';
import {DevicesView} from './components/DevicesView';
import {CalendarView} from './components/CalendarView';
import {AiAssistantView} from './components/AiAssistantView';
import {SettingsView, type SettingsSection} from './components/SettingsView';

const ChartsView = lazy(() =>
  import('./components/ChartsView').then((mod) => ({default: mod.ChartsView}))
);
import {AccountModal} from './components/AccountModal';
import {AuthGateScreen} from './components/AuthGateScreen';
import {DeviceDetailSheet} from './components/DeviceDetailSheet';
import {GlobalSearchModal} from './components/GlobalSearchModal';
import {ConfirmDialog, type ConfirmDialogRequest} from './components/ConfirmDialog';
import {DefineDeviceModal} from './components/DefineDeviceModal';
import {MediaPickerModal} from './components/MediaPickerModal';
import {ThemeQuickModal} from './components/ThemePicker';
import {getThemeDefinition} from './lib/themes';

interface ToastMessage {
  id: number;
  tone: 'success' | 'error';
  text: string;
}

function applyManagedFhemConfig(
  base: FhemConnectionConfig,
  managed?: ManagedFhemInfo
): FhemConnectionConfig {
  if (!managed?.enabled) {
    return base.useServerUpstream ? {...base, useServerUpstream: false} : base;
  }
  const shouldActivate =
    managed.exclusive || Boolean(base.useServerUpstream) || base.mode === 'local_instance';
  if (!shouldActivate) {
    return base;
  }
  return {
    ...base,
    mode: 'remote_server',
    transport: 'proxy',
    useServerUpstream: true,
    protocol: managed.protocol || base.protocol,
    host: managed.host || base.host,
    port: managed.port || base.port,
    basePath: managed.basePath || base.basePath,
    httpMethod: managed.httpMethod || base.httpMethod,
    csrfMode: managed.csrfMode || base.csrfMode,
    authType: managed.authType || base.authType,
  };
}

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [config, setConfig] = useState<FhemConnectionConfig>(DEFAULT_CONNECTION_CONFIG);
  const [aiConfig, setAiConfig] = useState<AiAssistantConfig>(DEFAULT_AI_CONFIG);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [customMedia, setCustomMedia] = useState<CustomMediaStore>(DEFAULT_CUSTOM_MEDIA);
  const [bootstrapped, setBootstrapped] = useState(false);

  const [keystoreEncrypted, setKeystoreEncrypted] = useState(true);
  const [keystoreUpdatedAt, setKeystoreUpdatedAt] = useState<string | null>(null);
  const [aiKeystoreEncrypted, setAiKeystoreEncrypted] = useState(true);
  const [aiKeystoreUpdatedAt, setAiKeystoreUpdatedAt] = useState<string | null>(null);

  const [devices, setDevices] = useState<FhemDevice[]>([]);
  const [events, setEvents] = useState<FhemEventItem[]>([]);
  const [logs, setLogs] = useState<FhemLogEntry[]>([]);
  const [eventsPaused, setEventsPaused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [status, setStatus] = useState<ConnectionStatus>({
    online: true,
    latencyMs: null,
    lastSync: null,
    errorCode: null,
    errorMessage: null,
    fhemVersion: 'FHEM 6.4',
    unsavedChanges: false,
    configMode: 'local_instance',
    longpollState: 'off',
  });

  const devicesRef = useRef<FhemDevice[]>([]);
  const eventsPausedRef = useRef<boolean>(false);
  devicesRef.current = devices;
  eventsPausedRef.current = eventsPaused;

  // User Profile & Cross-Device Sync
  const [authStatus, setAuthStatus] = useState<AuthStatus>({
    initialized: false,
    userCount: 0,
    authenticated: false,
    user: null,
    requireLogin: true,
    bootstrapTokenRequired: false,
  });
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [profileSyncing, setProfileSyncing] = useState(false);
  const [lastProfileSyncedAt, setLastProfileSyncedAt] = useState<string | null>(null);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSection | null>(null);
  const suppressAutoSyncRef = useRef(false);

  // Modals & navigation helpers
  const [selectedDeviceName, setSelectedDeviceName] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [defineModalOpen, setDefineModalOpen] = useState(false);
  const [defineDefaultType, setDefineDefaultType] = useState<string | undefined>(undefined);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const viewMode = preferences.viewMode || 'auto';
  const {isMobileView} = useDeviceViewport(viewMode);

  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [initialRoomFilter, setInitialRoomFilter] = useState<string | null>(null);
  const [initialDeviceFilter, setInitialDeviceFilter] = useState<'all' | 'active' | 'zigbee' | 'error' | 'favorites' | undefined>(undefined);
  const [chartTarget, setChartTarget] = useState<ChartTarget | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({id: Date.now(), tone, text});
    toastTimer.current = window.setTimeout(() => setToast(null), 3400);
  }, []);

  // Apply Dark/Light theme class and Material 3 color theme on <html>
  useEffect(() => {
    const root = document.documentElement;
    const def = getThemeDefinition(preferences.colorTheme);
    root.setAttribute('data-theme', def.id);
    if (preferences.theme === 'dark') {
      root.classList.add('dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', def.darkCanvas);
    } else {
      root.classList.remove('dark');
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', def.lightCanvas);
    }
  }, [preferences.theme, preferences.colorTheme]);

  // Global keyboard shortcuts ('/' or Ctrl+K for global search, Escape to close)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => !v);
      } else if (!inInput && e.key === '/') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
        setThemeModalOpen(false);
        setMobileMenuOpen(false);
        setAccountModalOpen(false);
        setSelectedDeviceName(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const syncMonitorData = useCallback(async (cfg: FhemConnectionConfig, paused: boolean) => {
    if (cfg.mode === 'local_instance') {
      if (!paused) {
        const nextEvents = await localFhemEngine.getEvents();
        setEvents(nextEvents);
      }
      const nextLogs = await localFhemEngine.getLogs();
      setLogs(nextLogs);
      const dirty = await localFhemEngine.hasUnsavedChanges();
      setStatus((prev) => ({...prev, unsavedChanges: dirty}));
    }
  }, []);

  const refreshDevices = useCallback(
    async (cfgOverride?: FhemConnectionConfig, silent = false) => {
      const activeCfg = cfgOverride || config;
      if (!silent) setRefreshing(true);

      const res = await fetchAllFhemDevices(activeCfg);

      if (res.ok) {
        setDevices(res.devices);
        setStatus((prev) => ({
          ...prev,
          online: true,
          latencyMs: res.latencyMs,
          lastSync: new Date().toLocaleTimeString('de-DE'),
          errorCode: null,
          errorMessage: null,
          configMode: activeCfg.mode,
        }));
        await syncMonitorData(activeCfg, eventsPaused);
      } else {
        setStatus((prev) => ({
          ...prev,
          online: false,
          latencyMs: res.latencyMs,
          errorCode: res.errorCode || 'ERROR',
          errorMessage: res.errorMessage || 'FHEM-Server nicht erreichbar.',
          configMode: activeCfg.mode,
        }));
        if (!silent) {
          showToast(res.errorMessage || 'Aktualisierung fehlgeschlagen.', 'error');
        }
      }

      if (!silent) setRefreshing(false);
    },
    [config, eventsPaused, showToast, syncMonitorData]
  );

  // Initial load from encrypted local keystore + IndexedDB + server auth status
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [loadedCfg, loadedAiCfg, loadedPrefs, loadedMedia, serverAuth] = await Promise.all([
        loadEncryptedConnectionConfig(),
        loadEncryptedAiConfig(),
        loadPreferences(),
        loadCustomMedia(),
        fetchAuthStatus(),
      ]);
      if (!mounted) return;
      setConfig(loadedCfg.config);
      setKeystoreEncrypted(loadedCfg.encrypted);
      setKeystoreUpdatedAt(loadedCfg.updatedAt);
      setAiConfig(loadedAiCfg.config);
      setAiKeystoreEncrypted(loadedAiCfg.encrypted);
      setAiKeystoreUpdatedAt(loadedAiCfg.updatedAt);
      setPreferences(loadedPrefs);
      setCustomMedia(loadedMedia);
      let shouldLoadDevices = true;
      let effectiveCfg = loadedCfg.config;
      if (serverAuth) {
        setAuthStatus(serverAuth);
        if (serverAuth.authenticated && serverAuth.user) {
          setCurrentUser(serverAuth.user);
          // Pull latest synced profile silently when restored via HttpOnly session cookie
          const syncedRes = await fetchSyncedProfile();
          if (!mounted) return;
          if (syncedRes.ok && syncedRes.hasProfile && syncedRes.profile) {
            suppressAutoSyncRef.current = true;
            window.setTimeout(() => {
              suppressAutoSyncRef.current = false;
            }, 1500);
            const synced = syncedRes.profile;
            effectiveCfg = applyManagedFhemConfig(
              {...DEFAULT_CONNECTION_CONFIG, ...synced.config},
              serverAuth.managedFhem
            );
            const mergedAi: AiAssistantConfig = {...DEFAULT_AI_CONFIG, ...synced.aiConfig};
            const mergedPrefs: AppPreferences = {...DEFAULT_PREFERENCES, ...synced.preferences};
            const mergedMedia: CustomMediaStore = {
              rooms: synced.customMedia?.rooms || {},
              devices: synced.customMedia?.devices || {},
              floorplan: synced.customMedia?.floorplan,
            };
            setConfig(effectiveCfg);
            setAiConfig(mergedAi);
            setPreferences(mergedPrefs);
            setCustomMedia(mergedMedia);
            const [savedCfg, savedAi] = await Promise.all([
              saveEncryptedConnectionConfig(effectiveCfg),
              saveEncryptedAiConfig(mergedAi),
              savePreferences(mergedPrefs),
              saveCustomMedia(mergedMedia),
            ]);
            if (!mounted) return;
            setKeystoreEncrypted(savedCfg.encrypted);
            setKeystoreUpdatedAt(savedCfg.updatedAt);
            setAiKeystoreEncrypted(savedAi.encrypted);
            setAiKeystoreUpdatedAt(savedAi.updatedAt);
            setLastProfileSyncedAt(new Date().toLocaleTimeString('de-DE'));
          } else {
            effectiveCfg = applyManagedFhemConfig(effectiveCfg, serverAuth.managedFhem);
            setConfig(effectiveCfg);
          }
        } else if (serverAuth.requireLogin) {
          shouldLoadDevices = false;
        } else {
          effectiveCfg = applyManagedFhemConfig(effectiveCfg, serverAuth.managedFhem);
          setConfig(effectiveCfg);
        }
      }
      setBootstrapped(true);
      if (shouldLoadDevices) {
        await refreshDevices(effectiveCfg);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const refreshAuthStatus = useCallback(async (): Promise<AuthStatus | null> => {
    const next = await fetchAuthStatus();
    if (next) {
      setAuthStatus(next);
      if (!next.authenticated) {
        setCurrentUser(null);
      } else if (next.user) {
        setCurrentUser(next.user);
      }
    }
    return next;
  }, []);

  const pushProfileToServer = useCallback(
    async (silent = false) => {
      setProfileSyncing(true);
      const res = await saveSyncedProfile({
        config,
        aiConfig,
        preferences,
        customMedia,
      });
      setProfileSyncing(false);
      if (res.ok) {
        setLastProfileSyncedAt(new Date().toLocaleTimeString('de-DE'));
        if (!silent) showToast('Profil erfolgreich auf dem Server gesichert.');
      } else if (!silent) {
        showToast(res.message || 'Profil-Synchronisation fehlgeschlagen.', 'error');
      }
    },
    [aiConfig, config, customMedia, preferences, showToast]
  );

  const pullProfileFromServer = useCallback(
    async (silent = false, managedOverride?: ManagedFhemInfo): Promise<boolean> => {
      setProfileSyncing(true);
      const res = await fetchSyncedProfile();
      setProfileSyncing(false);

      if (!res.ok) {
        if (!silent) showToast(res.message || 'Profil konnte nicht geladen werden.', 'error');
        return false;
      }
      if (!res.hasProfile || !res.profile) {
        if (!silent) showToast('Auf dem Server liegt noch kein gespeichertes Profil vor.');
        return false;
      }

      suppressAutoSyncRef.current = true;
      window.setTimeout(() => {
        suppressAutoSyncRef.current = false;
      }, 1500);

      const synced = res.profile;
      const mergedConfig: FhemConnectionConfig = applyManagedFhemConfig(
        {...DEFAULT_CONNECTION_CONFIG, ...synced.config},
        managedOverride ?? authStatus.managedFhem
      );
      const mergedAi: AiAssistantConfig = {...DEFAULT_AI_CONFIG, ...synced.aiConfig};
      const mergedPrefs: AppPreferences = {...DEFAULT_PREFERENCES, ...synced.preferences};
      const mergedMedia: CustomMediaStore = {
        rooms: synced.customMedia?.rooms || {},
        devices: synced.customMedia?.devices || {},
        floorplan: synced.customMedia?.floorplan,
      };

      setConfig(mergedConfig);
      setAiConfig(mergedAi);
      setPreferences(mergedPrefs);
      setCustomMedia(mergedMedia);

      const [savedCfg, savedAi] = await Promise.all([
        saveEncryptedConnectionConfig(mergedConfig),
        saveEncryptedAiConfig(mergedAi),
        savePreferences(mergedPrefs),
        saveCustomMedia(mergedMedia),
      ]);
      setKeystoreEncrypted(savedCfg.encrypted);
      setKeystoreUpdatedAt(savedCfg.updatedAt);
      setAiKeystoreEncrypted(savedAi.encrypted);
      setAiKeystoreUpdatedAt(savedAi.updatedAt);
      setLastProfileSyncedAt(new Date().toLocaleTimeString('de-DE'));

      await refreshDevices(mergedConfig, true);
      if (!silent) showToast('Profil vom Server geladen und angewendet.');
      return true;
    },
    [authStatus.managedFhem, refreshDevices, showToast]
  );

  const handleAuthenticated = useCallback(
    async (user: UserAccount, isBootstrap: boolean) => {
      setCurrentUser(user);
      const latestAuth = await refreshAuthStatus();
      const effectiveManaged = latestAuth?.managedFhem ?? authStatus.managedFhem;
      const nextCfg = applyManagedFhemConfig(config, effectiveManaged);
      if (nextCfg !== config) {
        setConfig(nextCfg);
      }
      if (isBootstrap) {
        await pushProfileToServer(true);
        await refreshDevices(nextCfg, true);
        showToast(`Admin-Profil „${user.displayName}“ erstellt & gesichert.`);
        return;
      }
      const hadServerProfile = await pullProfileFromServer(true, effectiveManaged);
      if (hadServerProfile) {
        showToast(`Willkommen zurück, ${user.displayName} — Profil geladen.`);
      } else {
        await pushProfileToServer(true);
        await refreshDevices(nextCfg, true);
        showToast(`Angemeldet als ${user.displayName} — lokale Einstellungen gesichert.`);
      }
    },
    [authStatus.managedFhem, config, pullProfileFromServer, pushProfileToServer, refreshAuthStatus, refreshDevices, showToast]
  );

  const handleLogout = useCallback(async () => {
    await logoutAccount();
    setCurrentUser(null);
    setLastProfileSyncedAt(null);
    if (authStatus.requireLogin) {
      setDevices([]);
      setEvents([]);
      setLogs([]);
      setSelectedDeviceName(null);
    }
    await refreshAuthStatus();
    showToast('Abgemeldet. Lokale Daten bleiben auf diesem Gerät erhalten.');
  }, [authStatus.requireLogin, refreshAuthStatus, showToast]);

  // Debounced auto-sync to server whenever settings/media/prefs change while logged in
  useEffect(() => {
    if (!bootstrapped || !currentUser || suppressAutoSyncRef.current) return;
    const timer = window.setTimeout(() => {
      if (!suppressAutoSyncRef.current) {
        void pushProfileToServer(true);
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [bootstrapped, currentUser, config, aiConfig, preferences, customMedia, pushProfileToServer]);

  // Real-time FHEMWEB Longpoll stream (local test bus + remote proxy/direct)
  useEffect(() => {
    if (!bootstrapped) return;
    if (authStatus.requireLogin && !currentUser) {
      setStatus((prev) => ({...prev, longpollState: 'off'}));
      return;
    }
    if (!config.longpollEnabled) {
      setStatus((prev) => ({...prev, longpollState: 'off'}));
      return;
    }

    const controller = startFhemLongpoll(config, {
      getKnownDeviceNames: () => devicesRef.current.map((d) => d.name),
      onStateChange: (lpState) => {
        setStatus((prev) => (prev.longpollState === lpState ? prev : {...prev, longpollState: lpState}));
      },
      onUpdate: (update) => {
        setDevices((prev) => applyLongpollUpdateToDevices(prev, update));
        setStatus((prev) => ({
          ...prev,
          online: true,
          lastSync: new Date().toLocaleTimeString('de-DE'),
        }));

        if (!update.isTimestampOnly && !eventsPausedRef.current) {
          const matchedDev = devicesRef.current.find((d) => d.name === update.deviceName);
          const eventText = `${update.reading}: ${update.value}`;
          setEvents((prev) => {
            const top = prev[0];
            if (top && top.device === update.deviceName && top.event === eventText && top.timestamp === update.timestamp) {
              return prev;
            }
            const nextItem: FhemEventItem = {
              id: `lp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              timestamp: update.timestamp,
              device: update.deviceName,
              deviceType: matchedDev?.type || 'FHEM',
              event: eventText,
              level: 'info',
            };
            return [nextItem, ...prev].slice(0, 200);
          });
        }
      },
    });

    return () => {
      controller.stop();
    };
  }, [bootstrapped, config, authStatus.requireLogin, currentUser]);

  // Auto-Polling timer (relaxed safety-sync while Longpoll is actively connected)
  useEffect(() => {
    if (!bootstrapped || config.pollIntervalSec <= 0) return;
    if (authStatus.requireLogin && !currentUser) return;
    const isLongpollConnected = config.longpollEnabled && status.longpollState === 'connected';
    const intervalSec = isLongpollConnected
      ? Math.max(config.pollIntervalSec * 4, 60)
      : config.pollIntervalSec;
    const id = window.setInterval(() => {
      void refreshDevices(config, true);
    }, intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [bootstrapped, config, status.longpollState, refreshDevices, authStatus.requireLogin, currentUser]);

  const updatePreferences = useCallback((patch: Partial<AppPreferences>) => {
    setPreferences((prev) => {
      const next = {...prev, ...patch};
      void savePreferences(next);
      return next;
    });
  }, []);

  const handleSaveMedia = useCallback(
    (target: MediaPickerTarget, src: string | null) => {
      setCustomMedia((prev) => {
        const next: CustomMediaStore = {
          rooms: {...prev.rooms},
          devices: {...prev.devices},
          floorplan: prev.floorplan,
        };
        if (target.kind === 'room') {
          if (src) next.rooms[target.key] = src;
          else delete next.rooms[target.key];
        } else if (target.kind === 'device') {
          if (src) next.devices[target.key] = src;
          else delete next.devices[target.key];
        } else {
          next.floorplan = src || undefined;
        }
        void saveCustomMedia(next);
        return next;
      });
      showToast(src ? `Bild für „${target.label}“ gespeichert.` : `Bild für „${target.label}“ zurückgesetzt.`);
    },
    [showToast]
  );

  const handleToggleFavorite = useCallback(
    (deviceName: string) => {
      setPreferences((prev) => {
        const exists = prev.favorites.includes(deviceName);
        const nextFavs = exists
          ? prev.favorites.filter((n) => n !== deviceName)
          : [...prev.favorites, deviceName];
        const next = {...prev, favorites: nextFavs};
        void savePreferences(next);
        return next;
      });
    },
    []
  );

  const handleMoveFavorite = useCallback((deviceName: string, direction: 'up' | 'down') => {
    setPreferences((prev) => {
      const idx = prev.favorites.indexOf(deviceName);
      if (idx === -1) return prev;
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.favorites.length) return prev;
      const nextFavs = [...prev.favorites];
      [nextFavs[idx], nextFavs[swapIdx]] = [nextFavs[swapIdx], nextFavs[idx]];
      const next = {...prev, favorites: nextFavs};
      void savePreferences(next);
      return next;
    });
  }, []);

  const handleReorderFavorites = useCallback((sourceName: string, targetName: string) => {
    setPreferences((prev) => {
      const fromIdx = prev.favorites.indexOf(sourceName);
      const toIdx = prev.favorites.indexOf(targetName);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const nextFavs = [...prev.favorites];
      const [moved] = nextFavs.splice(fromIdx, 1);
      nextFavs.splice(toIdx, 0, moved);
      const next = {...prev, favorites: nextFavs};
      void savePreferences(next);
      return next;
    });
  }, []);

  const handleToggleTileSize = useCallback((deviceName: string) => {
    setPreferences((prev) => {
      const current = prev.tileSizes?.[deviceName] ?? 'sm';
      const nextSize: TileSize = current === 'wide' ? 'sm' : 'wide';
      const next: AppPreferences = {
        ...prev,
        tileSizes: {
          ...(prev.tileSizes || {}),
          [deviceName]: nextSize,
        },
      };
      void savePreferences(next);
      return next;
    });
  }, []);

  const handleSyncFromAppOptions = useCallback(() => {
    const flagged = devices
      .filter((d) => d.appOptions?.dashboard)
      .sort((a, b) => (a.appOptions?.sortby ?? 999) - (b.appOptions?.sortby ?? 999));
    if (flagged.length === 0) {
      showToast('Keine Geräte mit Attribut appOptions.dashboard=true gefunden.', 'error');
      return;
    }
    setPreferences((prev) => {
      const nextFavs = Array.from(new Set([...flagged.map((d) => d.name), ...prev.favorites]));
      const nextSizes: Record<string, TileSize> = {...(prev.tileSizes || {})};
      for (const d of flagged) {
        if (d.appOptions?.size) {
          nextSizes[d.name] = d.appOptions.size;
        }
      }
      const next = {...prev, favorites: nextFavs, tileSizes: nextSizes};
      void savePreferences(next);
      return next;
    });
    showToast(`${flagged.length} Geräte aus FHEM appOptions ins Dashboard übernommen.`);
  }, [devices, showToast]);

  const handleExecuteCommand = useCallback(
    async (cmd: string) => {
      const res = await executeFhemCommand(config, cmd);
      if (res.ok) {
        if (config.mode === 'remote_server' && !eventsPaused) {
          setEvents((prev) => [
            {
              id: `ev-${Date.now()}`,
              timestamp: new Date().toLocaleTimeString('de-DE'),
              device: cmd.split(/\s+/)[1] || 'FHEM',
              deviceType: 'FHEMWEB',
              event: cmd,
              level: 'info',
            },
            ...prev.slice(0, 149),
          ]);
        }
        // Track unsaved config changes for remote mode too
        if (cmd.startsWith('attr ') || cmd.startsWith('deleteattr ') || cmd.startsWith('define ') || cmd.startsWith('delete ')) {
          setStatus((prev) => ({...prev, unsavedChanges: true}));
        } else if (cmd.trim() === 'save') {
          setStatus((prev) => ({...prev, unsavedChanges: false}));
        }

        await refreshDevices(config, true);

        if (cmd === 'save') {
          showToast('FHEM-Konfiguration (fhem.cfg) erfolgreich gespeichert.');
        } else if (cmd.startsWith('attr ')) {
          showToast('Attribut erfolgreich aktualisiert.');
        } else if (cmd.startsWith('deleteattr ')) {
          showToast('Attribut entfernt.');
        } else if (cmd.startsWith('define ')) {
          showToast('Neues Device erfolgreich definiert.');
        } else if (cmd.startsWith('delete ')) {
          showToast('Device erfolgreich gelöscht.');
        }
      } else {
        setStatus((prev) => ({
          ...prev,
          online: res.errorCode === 'TIMEOUT' || res.errorCode === 'UNREACHABLE' ? false : prev.online,
          errorCode: res.errorCode || 'CMD_ERROR',
          errorMessage: res.errorMessage || 'Befehl fehlgeschlagen.',
        }));
        showToast(res.errorMessage || 'Befehl konnte nicht ausgeführt werden.', 'error');
      }
      return res;
    },
    [config, eventsPaused, refreshDevices, showToast]
  );

  // Admin actions guarded by ConfirmDialog
  const requestSaveConfig = () => {
    void handleExecuteCommand('save');
  };

  const requestRestartFhem = () => {
    setConfirmRequest({
      title: 'FHEM-Server neu starten?',
      description:
        'Alle laufenden Verbindungen werden kurzzeitig unterbrochen. Nicht gespeicherte Konfigurationsänderungen sollten vorher mit „save“ gesichert werden.',
      fhemCommand: 'shutdown restart',
      confirmLabel: 'Jetzt neu starten',
      destructive: true,
      onConfirm: async () => {
        setConfirmBusy(true);
        const res = await handleExecuteCommand('shutdown restart');
        setConfirmBusy(false);
        if (res.ok) showToast('FHEM-Neustart (shutdown restart) ausgelöst.');
      },
    });
  };

  const requestShutdownFhem = () => {
    setConfirmRequest({
      title: 'FHEM-Server herunterfahren?',
      description:
        'Der FHEM-Dienst wird vollständig beendet und muss auf dem Host-System (z. B. per systemd) wieder gestartet werden.',
      fhemCommand: 'shutdown',
      confirmLabel: 'Herunterfahren',
      destructive: true,
      onConfirm: async () => {
        setConfirmBusy(true);
        const res = await handleExecuteCommand('shutdown');
        setConfirmBusy(false);
        if (res.ok) showToast('FHEM-Shutdown-Befehl gesendet.');
      },
    });
  };

  const requestDeleteDevice = (device: FhemDevice) => {
    setConfirmRequest({
      title: `Gerät „${device.alias}“ löschen?`,
      description: `Das FHEM-Device „${device.name}“ (${device.type}) wird dauerhaft aus der laufenden Konfiguration entfernt.`,
      fhemCommand: `delete ${device.name}`,
      confirmLabel: 'Dauerhaft löschen',
      destructive: true,
      onConfirm: async () => {
        setConfirmBusy(true);
        const res = await handleExecuteCommand(`delete ${device.name}`);
        setConfirmBusy(false);
        if (res.ok) {
          setSelectedDeviceName(null);
        }
      },
    });
  };

  const handleSubmitDefine = (payload: {
    name: string;
    type: string;
    definition: string;
    room: string;
    alias: string;
  }) => {
    const defineCmd = `define ${payload.name} ${payload.type}${payload.definition ? ` ${payload.definition}` : ''}`;
    setConfirmRequest({
      title: `Neues Device „${payload.name}“ anlegen?`,
      description: `Definiert ein neues ${payload.type}-Gerät auf dem FHEM-Server${payload.room ? ` im Raum ${payload.room}` : ''}.`,
      fhemCommand: defineCmd,
      confirmLabel: 'Device definieren',
      destructive: false,
      onConfirm: async () => {
        setConfirmBusy(true);
        const res = await handleExecuteCommand(defineCmd);
        if (res.ok) {
          if (payload.alias) await executeFhemCommand(config, `attr ${payload.name} alias ${payload.alias}`);
          if (payload.room) await executeFhemCommand(config, `attr ${payload.name} room ${payload.room}`);
          await refreshDevices(config, true);
        }
        setConfirmBusy(false);
      },
    });
  };

  const handleSaveConnectionConfig = async (next: FhemConnectionConfig) => {
    const saved = await saveEncryptedConnectionConfig(next);
    setConfig(next);
    setKeystoreEncrypted(saved.encrypted);
    setKeystoreUpdatedAt(saved.updatedAt);
    await refreshDevices(next);
  };

  const handleSaveAiConfig = async (next: AiAssistantConfig) => {
    const saved = await saveEncryptedAiConfig(next);
    setAiConfig(next);
    setAiKeystoreEncrypted(saved.encrypted);
    setAiKeystoreUpdatedAt(saved.updatedAt);
    showToast('KI-Assistent verschlüsselt gespeichert.');
  };

  const pendingAiConfirmResolver = useRef<((res: CommandExecutionResult) => void) | null>(null);

  const handleExecuteAiCommand = useCallback(
    (cmd: string, requiresConfirm: boolean): Promise<CommandExecutionResult> => {
      const trimmed = cmd.trim();
      const firstWord = trimmed.split(/\s+/)[0]?.toLowerCase() || '';
      const mustGate =
        requiresConfirm ||
        firstWord === 'define' ||
        firstWord === 'delete' ||
        firstWord === 'shutdown';

      if (!mustGate) {
        return handleExecuteCommand(trimmed);
      }

      return new Promise<CommandExecutionResult>((resolve) => {
        pendingAiConfirmResolver.current = resolve;
        const isDestructive = firstWord === 'delete' || firstWord === 'shutdown';
        setConfirmRequest({
          title:
            firstWord === 'define'
              ? 'KI-Vorschlag: Neues Device definieren?'
              : firstWord === 'delete'
                ? 'KI-Vorschlag: Device löschen?'
                : 'KI-Vorschlag: Server-Befehl ausführen?',
          description:
            'Der FHEM KI-Assistent möchte folgenden administrativen Befehl auf deinem FHEM-Server ausführen. Bitte prüfe die Syntax vor dem Ausführen.',
          fhemCommand: trimmed,
          confirmLabel: isDestructive ? 'Jetzt ausführen' : 'Befehl ausführen',
          destructive: isDestructive,
          onConfirm: async () => {
            setConfirmBusy(true);
            const res = await handleExecuteCommand(trimmed);
            setConfirmBusy(false);
            const resolver = pendingAiConfirmResolver.current;
            pendingAiConfirmResolver.current = null;
            resolver?.(res);
          },
        });
      });
    },
    [handleExecuteCommand]
  );

  const handleTestConnection = async (candidate: FhemConnectionConfig) => {
    const res = await fetchAllFhemDevices(candidate);
    if (res.ok) {
      return {
        ok: true,
        latencyMs: res.latencyMs,
        statusCode: res.statusCode,
        csrfToken: res.csrfTokenHeader,
        message: `Verbindung erfolgreich — ${res.devices.length} Geräte über jsonlist2 geladen.`,
      };
    }
    return {
      ok: false,
      latencyMs: res.latencyMs,
      statusCode: res.statusCode,
      errorCode: res.errorCode,
      csrfToken: res.csrfTokenHeader,
      diagnosticHint: res.diagnosticHint,
      message: res.errorMessage || 'Verbindung fehlgeschlagen.',
    };
  };

  const handleReloadLogs = async () => {
    if (config.mode === 'local_instance') {
      const nextLogs = await localFhemEngine.getLogs();
      setLogs(nextLogs);
      showToast('Logfile aktualisiert.');
      return;
    }
    const res = await executeFhemCommand(config, 'get Logfile - - 2026-01-01 2099-12-31');
    if (res.ok && res.data) {
      const parsed: FhemLogEntry[] = res.data
        .split('\n')
        .filter(Boolean)
        .slice(-100)
        .reverse()
        .map((line, i) => ({
          id: `rlog-${i}`,
          timestamp: line.slice(0, 19),
          level: 3,
          source: 'FHEM',
          message: line.slice(20) || line,
        }));
      setLogs(parsed);
      showToast('Remote-Logfile geladen.');
    } else {
      showToast(res.errorMessage || 'Logfile konnte nicht abgerufen werden.', 'error');
    }
  };

  const requestResetLocalData = () => {
    setConfirmRequest({
      title: 'Lokale App-Daten zurücksetzen?',
      description:
        'Alle lokal gespeicherten Server-Zugangsdaten, Favoriten und Änderungen in der Test-Instanz werden auf Werkseinstellungen zurückgesetzt.',
      fhemCommand: 'LOCAL_KEYSTORE_RESET',
      confirmLabel: 'Alles zurücksetzen',
      destructive: true,
      onConfirm: async () => {
        setConfirmBusy(true);
        await clearAllLocalData();
        await localFhemEngine.reset();
        const resetCfg = applyManagedFhemConfig(DEFAULT_CONNECTION_CONFIG, authStatus.managedFhem);
        setConfig(resetCfg);
        setAiConfig(DEFAULT_AI_CONFIG);
        setPreferences(DEFAULT_PREFERENCES);
        setCustomMedia(DEFAULT_CUSTOM_MEDIA);
        setKeystoreUpdatedAt(null);
        setAiKeystoreUpdatedAt(null);
        await refreshDevices(resetCfg);
        setConfirmBusy(false);
        showToast('Lokale Daten zurückgesetzt.');
      },
    });
  };

  const selectedDevice = useMemo(
    () => (selectedDeviceName ? devices.find((d) => d.name === selectedDeviceName) || null : null),
    [devices, selectedDeviceName]
  );

  const errorCount = useMemo(
    () => devices.filter((d) => d.statusTone === 'error').length,
    [devices]
  );

  const scheduleCount = useMemo(
    () => extractSchedulesFromDevices(devices).length,
    [devices]
  );

  const chartableCount = useMemo(
    () => devices.filter((d) => isDeviceChartable(d)).length,
    [devices]
  );

  const sidebarRooms = useMemo<SidebarRoomItem[]>(() => {
    const map = new Map<string, SidebarRoomItem>();
    for (const d of devices) {
      const key = d.primaryRoom || 'Unsortiert';
      const existing = map.get(key) || {name: key, count: 0, lightsOn: 0, errors: 0};
      existing.count += 1;
      if (d.category === 'light' && d.statusTone === 'active') existing.lightsOn += 1;
      if (d.statusTone === 'error') existing.errors += 1;
      map.set(key, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [devices]);

  const handleOpenRoom = useCallback((room: string) => {
    setSelectedRoom(room);
    setActiveTab('rooms');
  }, []);

  const handleOpenChart = useCallback((deviceName: string, readingKey?: string) => {
    setChartTarget({deviceName, readingKey});
    setSelectedDeviceName(null);
    setActiveTab('charts');
  }, []);

  if (!bootstrapped) {
    return (
      <div className="min-h-screen theme-canvas text-slate-900 dark:text-[#E6EDF3] flex items-center justify-center px-4">
        <div className="flex flex-col items-center gap-3">
          <img
            src="/icon.svg"
            alt="FHEM Control Desk"
            className="h-12 w-12 rounded-2xl animate-pulse"
            referrerPolicy="no-referrer"
          />
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            FHEM Control Desk wird geladen…
          </span>
        </div>
      </div>
    );
  }

  if (authStatus.requireLogin && !currentUser) {
    return (
      <AuthGateScreen
        authStatus={authStatus}
        onAuthenticated={handleAuthenticated}
      />
    );
  }

  return (
    <div className="min-h-screen theme-canvas text-slate-900 dark:text-[#E6EDF3] transition-colors">
      {/* Desktop Left Sidebar (only mounted in Desktop view) */}
      {!isMobileView && (
        <BottomNav
          activeTab={activeTab}
          selectedRoom={selectedRoom}
          rooms={sidebarRooms}
          onSelectTab={setActiveTab}
          onSelectRoom={handleOpenRoom}
          deviceCount={devices.length}
          errorCount={errorCount}
          scheduleCount={scheduleCount}
          chartableCount={chartableCount}
          theme={preferences.theme}
          colorTheme={preferences.colorTheme}
          viewMode={viewMode}
          onToggleTheme={() =>
            updatePreferences({theme: preferences.theme === 'dark' ? 'light' : 'dark'})
          }
          onSelectColorTheme={(id) => updatePreferences({colorTheme: id})}
          onChangeViewMode={(mode) => updatePreferences({viewMode: mode})}
        />
      )}

      {/* Main Layout Shell */}
      <div className={`${isMobileView ? '' : 'pl-64'} flex min-h-screen flex-col`}>
        {isMobileView ? (
          <MobileHeader
            activeTab={activeTab}
            selectedRoom={selectedRoom}
            status={status}
            refreshing={refreshing}
            currentUser={currentUser}
            onRefresh={() => void refreshDevices()}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenAccount={() => setAccountModalOpen(true)}
            onOpenMenu={() => setMobileMenuOpen(true)}
          />
        ) : (
          <AppHeader
            status={status}
            refreshing={refreshing}
            currentUser={currentUser}
            onRefresh={() => void refreshDevices()}
            onOpenSearch={() => setSearchOpen(true)}
            onOpenSaveConfig={requestSaveConfig}
            onOpenThemePicker={() => setThemeModalOpen(true)}
            onOpenAssistant={() => setActiveTab('assistant')}
            onOpenAccount={() => setAccountModalOpen(true)}
          />
        )}

        {/* Connection Error Alert Banner */}
        {status.errorMessage && !status.online && (
          <div className={isMobileView ? 'mx-auto w-full max-w-2xl px-3 pt-3' : 'mx-auto w-full max-w-7xl px-6 pt-4'}>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-300/80 bg-red-500/10 px-4 py-3 text-xs text-red-700 dark:border-red-500/40 dark:text-red-300">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{status.errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="min-h-[36px] rounded-xl bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700"
              >
                Verbindung prüfen
              </button>
            </div>
          </div>
        )}

        {/* Active View Content */}
        <main
          className={
            isMobileView
              ? 'mx-auto w-full max-w-2xl flex-1 px-3 pt-3.5 pb-24'
              : 'mx-auto w-full max-w-7xl flex-1 px-6 pt-5 pb-8'
          }
        >
          {activeTab === 'dashboard' && (
            <DashboardView
              devices={devices}
              config={config}
              connectionStatus={status}
              favorites={preferences.favorites}
              compactCards={preferences.compactCards}
              tileSizes={preferences.tileSizes || {}}
              dashboardGrouping={preferences.dashboardGrouping || 'grid'}
              showZigbeeMetrics={preferences.showZigbeeMetrics}
              showVisuals={preferences.showVisuals}
              customMedia={customMedia}
              refreshing={refreshing}
              isMobileView={isMobileView}
              onRefresh={() => refreshDevices()}
              onCommand={(cmd) => void handleExecuteCommand(cmd)}
              onOpenDetail={(dev) => setSelectedDeviceName(dev.name)}
              onOpenMediaPicker={setMediaPickerTarget}
              onToggleFavorite={handleToggleFavorite}
              onMoveFavorite={handleMoveFavorite}
              onReorderFavorites={handleReorderFavorites}
              onToggleTileSize={handleToggleTileSize}
              onToggleCompactCards={() =>
                updatePreferences({compactCards: !preferences.compactCards})
              }
              onChangeGrouping={(dashboardGrouping) => updatePreferences({dashboardGrouping})}
              onSyncFromAppOptions={handleSyncFromAppOptions}
              onJumpToRoom={handleOpenRoom}
              onJumpToCalendar={() => setActiveTab('calendar')}
              onJumpToErrors={() => {
                setInitialDeviceFilter('error');
                setActiveTab('devices');
              }}
            />
          )}

          {activeTab === 'rooms' && (
            <RoomsView
              devices={devices}
              favorites={preferences.favorites}
              selectedRoom={selectedRoom}
              showZigbeeMetrics={preferences.showZigbeeMetrics}
              showVisuals={preferences.showVisuals}
              customMedia={customMedia}
              onSelectRoom={setSelectedRoom}
              onOpenDetail={(dev) => setSelectedDeviceName(dev.name)}
              onOpenMediaPicker={setMediaPickerTarget}
              onCommand={(cmd) => void handleExecuteCommand(cmd)}
              onToggleFavorite={handleToggleFavorite}
            />
          )}

          {activeTab === 'devices' && (
            <DevicesView
              devices={devices}
              favorites={preferences.favorites}
              showZigbeeMetrics={preferences.showZigbeeMetrics}
              showVisuals={preferences.showVisuals}
              customMedia={customMedia}
              initialRoomFilter={initialRoomFilter}
              initialFilterMode={initialDeviceFilter}
              onClearInitialFilters={() => {
                setInitialRoomFilter(null);
                setInitialDeviceFilter(undefined);
              }}
              onOpenDetail={(dev) => setSelectedDeviceName(dev.name)}
              onCommand={(cmd) => void handleExecuteCommand(cmd)}
              onToggleFavorite={handleToggleFavorite}
              onOpenDefineModal={() => {
                setDefineDefaultType(undefined);
                setDefineModalOpen(true);
              }}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView
              devices={devices}
              onCommand={(cmd) => void handleExecuteCommand(cmd)}
              onOpenDetail={(dev) => setSelectedDeviceName(dev.name)}
              onOpenDefineSchedule={() => {
                setDefineDefaultType('at');
                setDefineModalOpen(true);
              }}
            />
          )}

          {activeTab === 'charts' && (
            <Suspense
              fallback={
                <div className="space-y-4 pb-8">
                  <div className="h-10 w-64 rounded-2xl theme-surface animate-pulse" />
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    <div className="lg:col-span-4 h-96 rounded-3xl border theme-surface animate-pulse" />
                    <div className="lg:col-span-8 h-96 rounded-3xl border theme-surface animate-pulse" />
                  </div>
                </div>
              }
            >
              <ChartsView
                devices={devices}
                config={config}
                initialTarget={chartTarget}
                onClearInitialTarget={() => setChartTarget(null)}
                onOpenDetail={(dev) => setSelectedDeviceName(dev.name)}
              />
            </Suspense>
          )}

          {activeTab === 'assistant' && (
            <AiAssistantView
              devices={devices}
              aiConfig={aiConfig}
              aiKeystoreEncrypted={aiKeystoreEncrypted}
              aiKeystoreUpdatedAt={aiKeystoreUpdatedAt}
              onSaveAiConfig={handleSaveAiConfig}
              onExecuteAiCommand={handleExecuteAiCommand}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              config={config}
              status={status}
              preferences={preferences}
              devices={devices}
              customMedia={customMedia}
              keystoreEncrypted={keystoreEncrypted}
              keystoreUpdatedAt={keystoreUpdatedAt}
              events={events}
              logs={logs}
              eventsPaused={eventsPaused}
              onToggleEventsPaused={() => setEventsPaused((v) => !v)}
              onClearEvents={() => setEvents([])}
              onReloadLogs={handleReloadLogs}
              onSaveConfig={handleSaveConnectionConfig}
              onTestConnection={handleTestConnection}
              onUpdatePreferences={updatePreferences}
              onOpenMediaPicker={setMediaPickerTarget}
              onExecuteConsoleCommand={handleExecuteCommand}
              onSaveFhemCfg={requestSaveConfig}
              onRequestRestartFhem={requestRestartFhem}
              onRequestShutdownFhem={requestShutdownFhem}
              onOpenDefineModal={() => {
                setDefineDefaultType(undefined);
                setDefineModalOpen(true);
              }}
              onRequestResetLocalData={requestResetLocalData}
              onOpenAiAssistant={() => setActiveTab('assistant')}
              authStatus={authStatus}
              currentUser={currentUser}
              profileSyncing={profileSyncing}
              lastProfileSyncedAt={lastProfileSyncedAt}
              initialSection={settingsInitialSection}
              onClearInitialSection={() => setSettingsInitialSection(null)}
              onOpenAccountModal={() => setAccountModalOpen(true)}
              onPullProfile={async () => {
                await pullProfileFromServer(false);
              }}
              onPushProfile={() => pushProfileToServer(false)}
              onLogout={handleLogout}
              onRefreshAuthStatus={async () => {
                await refreshAuthStatus();
              }}
            />
          )}
        </main>
      </div>

      {/* Dedicated Mobile Bottom Navigation & Thumb-Zone Menu Drawer */}
      {isMobileView && (
        <MobileBottomNav
          activeTab={activeTab}
          status={status}
          currentUser={currentUser}
          errorCount={errorCount}
          scheduleCount={scheduleCount}
          theme={preferences.theme}
          colorTheme={preferences.colorTheme}
          viewMode={viewMode}
          menuOpen={mobileMenuOpen}
          onSetMenuOpen={setMobileMenuOpen}
          onSelectTab={setActiveTab}
          onToggleTheme={() =>
            updatePreferences({theme: preferences.theme === 'dark' ? 'light' : 'dark'})
          }
          onOpenThemePicker={() => setThemeModalOpen(true)}
          onOpenSaveConfig={requestSaveConfig}
          onOpenAccount={() => setAccountModalOpen(true)}
          onChangeViewMode={(mode) => updatePreferences({viewMode: mode})}
        />
      )}

      {/* Overlays & Modals */}
      <DeviceDetailSheet
        device={selectedDevice}
        isFavorite={selectedDevice ? preferences.favorites.includes(selectedDevice.name) : false}
        deviceImage={selectedDevice ? resolveDeviceImage(selectedDevice, customMedia).src : null}
        onClose={() => setSelectedDeviceName(null)}
        onToggleFavorite={handleToggleFavorite}
        onEditDeviceImage={(dev) =>
          setMediaPickerTarget({kind: 'device', key: dev.name, label: dev.alias})
        }
        onOpenChart={handleOpenChart}
        onExecuteCommand={handleExecuteCommand}
        onRequestDeleteDevice={requestDeleteDevice}
      />

      <MediaPickerModal
        target={mediaPickerTarget}
        currentSrc={
          mediaPickerTarget
            ? mediaPickerTarget.kind === 'room'
              ? resolveRoomImage(mediaPickerTarget.key, customMedia).src
              : mediaPickerTarget.kind === 'device'
                ? (() => {
                    const dev = devices.find((d) => d.name === mediaPickerTarget.key);
                    return dev
                      ? resolveDeviceImage(dev, customMedia).src
                      : customMedia.devices[mediaPickerTarget.key] || null;
                  })()
                : customMedia.floorplan || null
            : null
        }
        hasCustomValue={
          mediaPickerTarget
            ? mediaPickerTarget.kind === 'room'
              ? Boolean(customMedia.rooms[mediaPickerTarget.key])
              : mediaPickerTarget.kind === 'device'
                ? Boolean(customMedia.devices[mediaPickerTarget.key])
                : Boolean(customMedia.floorplan)
            : false
        }
        onClose={() => setMediaPickerTarget(null)}
        onSave={handleSaveMedia}
      />

      <GlobalSearchModal
        open={searchOpen}
        devices={devices}
        onClose={() => setSearchOpen(false)}
        onSelectDevice={(dev) => setSelectedDeviceName(dev.name)}
        onQuickCommand={(cmd) => void handleExecuteCommand(cmd)}
      />

      <DefineDeviceModal
        open={defineModalOpen}
        defaultType={defineDefaultType}
        onClose={() => setDefineModalOpen(false)}
        onSubmitDefine={handleSubmitDefine}
      />

      <ConfirmDialog
        request={confirmRequest}
        busy={confirmBusy}
        onClose={() => {
          if (!confirmBusy) {
            setConfirmRequest(null);
            if (pendingAiConfirmResolver.current) {
              const resolver = pendingAiConfirmResolver.current;
              pendingAiConfirmResolver.current = null;
              resolver({
                ok: false,
                data: '',
                latencyMs: 0,
                errorCode: 'CANCELLED',
                errorMessage: 'Ausführung vom Nutzer abgebrochen.',
                requestUrlPreview: '',
              });
            }
          }
        }}
      />

      <ThemeQuickModal
        open={themeModalOpen}
        mode={preferences.theme}
        colorTheme={preferences.colorTheme}
        onClose={() => setThemeModalOpen(false)}
        onSelectMode={(mode) => updatePreferences({theme: mode})}
        onSelectColorTheme={(id) => updatePreferences({colorTheme: id})}
      />

      <AccountModal
        open={accountModalOpen}
        authStatus={authStatus}
        currentUser={currentUser}
        syncing={profileSyncing}
        lastSyncedAt={lastProfileSyncedAt}
        onClose={() => setAccountModalOpen(false)}
        onAuthenticated={handleAuthenticated}
        onLogout={handleLogout}
        onPullProfile={async () => {
          await pullProfileFromServer(false);
        }}
        onPushProfile={() => pushProfileToServer(false)}
        onOpenUserManagement={() => {
          setAccountModalOpen(false);
          setSettingsInitialSection('profile');
          setActiveTab('settings');
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed z-50 flex items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-900 shadow-xl dark:border-[#2A3444] dark:bg-[#1B222D] dark:text-slate-100 ${
            isMobileView
              ? 'bottom-[74px] left-3 right-3 sm:left-auto sm:right-4 sm:max-w-sm'
              : 'bottom-6 right-4 max-w-sm'
          }`}
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <span className="flex-1">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Meldung schließen"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
