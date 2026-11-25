import {lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AlertTriangle, CheckCircle2, X} from 'lucide-react';
import type {
  ActiveTab,
  AiAssistantConfig,
  AppPreferences,
  ChartTarget,
  CommandExecutionResult,
  ConnectionStatus,
  CustomMediaStore,
  FhemConnectionConfig,
  FhemDevice,
  FhemEventItem,
  FhemLogEntry,
  MediaPickerTarget,
  TileSize,
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
  applyLongpollUpdateToDevices,
  executeFhemCommand,
  extractSchedulesFromDevices,
  fetchAllFhemDevices,
  localFhemEngine,
  startFhemLongpoll,
} from './lib/fhemClient';
import {resolveDeviceImage, resolveRoomImage} from './lib/roomVisuals';
import {isDeviceChartable} from './lib/sensorHistory';
import {AppHeader} from './components/AppHeader';
import {BottomNav, type SidebarRoomItem} from './components/BottomNav';
import {DashboardView} from './components/DashboardView';
import {RoomsView} from './components/RoomsView';
import {DevicesView} from './components/DevicesView';
import {CalendarView} from './components/CalendarView';
import {AiAssistantView} from './components/AiAssistantView';
import {SettingsView} from './components/SettingsView';

const ChartsView = lazy(() =>
  import('./components/ChartsView').then((mod) => ({default: mod.ChartsView}))
);
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

  // Modals & navigation helpers
  const [selectedDeviceName, setSelectedDeviceName] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [defineModalOpen, setDefineModalOpen] = useState(false);
  const [defineDefaultType, setDefineDefaultType] = useState<string | undefined>(undefined);
  const [mediaPickerTarget, setMediaPickerTarget] = useState<MediaPickerTarget | null>(null);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmDialogRequest | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

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

  // Initial load from encrypted local keystore + IndexedDB
  useEffect(() => {
    let mounted = true;
    (async () => {
      const [loadedCfg, loadedAiCfg, loadedPrefs, loadedMedia] = await Promise.all([
        loadEncryptedConnectionConfig(),
        loadEncryptedAiConfig(),
        loadPreferences(),
        loadCustomMedia(),
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
      setBootstrapped(true);
      await refreshDevices(loadedCfg.config);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Real-time FHEMWEB Longpoll stream (local test bus + remote proxy/direct)
  useEffect(() => {
    if (!bootstrapped) return;
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
  }, [bootstrapped, config]);

  // Auto-Polling timer (relaxed safety-sync while Longpoll is actively connected)
  useEffect(() => {
    if (!bootstrapped || config.pollIntervalSec <= 0) return;
    const isLongpollConnected = config.longpollEnabled && status.longpollState === 'connected';
    const intervalSec = isLongpollConnected
      ? Math.max(config.pollIntervalSec * 4, 60)
      : config.pollIntervalSec;
    const id = window.setInterval(() => {
      void refreshDevices(config, true);
    }, intervalSec * 1000);
    return () => window.clearInterval(id);
  }, [bootstrapped, config, status.longpollState, refreshDevices]);

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
        setConfig(DEFAULT_CONNECTION_CONFIG);
        setAiConfig(DEFAULT_AI_CONFIG);
        setPreferences(DEFAULT_PREFERENCES);
        setCustomMedia(DEFAULT_CUSTOM_MEDIA);
        setKeystoreUpdatedAt(null);
        setAiKeystoreUpdatedAt(null);
        await refreshDevices(DEFAULT_CONNECTION_CONFIG);
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

  return (
    <div className="min-h-screen theme-canvas text-slate-900 dark:text-[#E6EDF3] transition-colors">
      {/* Desktop Sidebar & Mobile Bottom Navigation */}
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
        onToggleTheme={() =>
          updatePreferences({theme: preferences.theme === 'dark' ? 'light' : 'dark'})
        }
        onSelectColorTheme={(id) => updatePreferences({colorTheme: id})}
      />

      {/* Main Layout Shell */}
      <div className="lg:pl-64 flex min-h-screen flex-col">
        <AppHeader
          status={status}
          refreshing={refreshing}
          onRefresh={() => void refreshDevices()}
          onOpenSearch={() => setSearchOpen(true)}
          onOpenSaveConfig={requestSaveConfig}
          onOpenThemePicker={() => setThemeModalOpen(true)}
          onOpenAssistant={() => setActiveTab('assistant')}
          onOpenCalendar={() => setActiveTab('calendar')}
          onOpenCharts={() => setActiveTab('charts')}
        />

        {/* Connection Error Alert Banner */}
        {status.errorMessage && !status.online && (
          <div className="mx-auto w-full max-w-7xl px-4 pt-4 lg:px-6">
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
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-24 lg:px-6 lg:pb-8">
          {activeTab === 'dashboard' && (
            <DashboardView
              devices={devices}
              favorites={preferences.favorites}
              compactCards={preferences.compactCards}
              tileSizes={preferences.tileSizes || {}}
              dashboardGrouping={preferences.dashboardGrouping || 'grid'}
              showZigbeeMetrics={preferences.showZigbeeMetrics}
              showVisuals={preferences.showVisuals}
              customMedia={customMedia}
              refreshing={refreshing}
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
            />
          )}
        </main>
      </div>

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

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 right-4 z-50 flex max-w-sm items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-900 shadow-xl dark:border-[#2A3444] dark:bg-[#1B222D] dark:text-slate-100">
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
