import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  AlertTriangle,
  Archive,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Download,
  FolderOpen,
  HardDrive,
  Info,
  Play,
  RefreshCw,
  Save,
} from 'lucide-react';
import type {FhemConnectionConfig} from '../types/fhem';
import {
  downloadFhemBackup,
  FHEM_LIST_BACKUPS_CMD,
  parseFhemBackupListOutput,
  type FhemServerBackupItem,
} from '../lib/fhemClient';

interface BackupsSectionProps {
  config: FhemConnectionConfig;
  unsavedChanges: boolean;
  isLocalMode: boolean;
  onExecuteCommand: (
    cmd: string
  ) => Promise<{ok: boolean; data: string; errorMessage?: string; requestUrlPreview: string; latencyMs: number}>;
  onAfterSaveConfig?: () => void;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '–';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace('.', ',')} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2).replace('.', ',')} MB`;
  return `${(mb / 1024).toFixed(2).replace('.', ',')} GB`;
}

function formatRelativeAge(mtimeSec: number): string {
  if (!mtimeSec) return '';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - mtimeSec);
  if (diffSec < 60) return 'gerade eben';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `vor ${mins} Min.`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'vor 1 Tag';
  return `vor ${days} Tagen`;
}

export const BackupsSection: React.FC<BackupsSectionProps> = ({
  config,
  unsavedChanges,
  isLocalMode,
  onExecuteCommand,
  onAfterSaveConfig,
}) => {
  const [directory, setDirectory] = useState<string>('./backup');
  const [backups, setBackups] = useState<FhemServerBackupItem[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [listError, setListError] = useState<string | null>(null);
  const [creating, setCreating] = useState<boolean>(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [saveBeforeBackup, setSaveBeforeBackup] = useState<boolean>(unsavedChanges);
  const [followSymlinks, setFollowSymlinks] = useState<boolean>(false);
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [downloadFeedback, setDownloadFeedback] = useState<{ok: boolean; message: string} | null>(null);
  const [commandFeedback, setCommandFeedback] = useState<{
    ok: boolean;
    message: string;
    output?: string;
    latencyMs?: number;
  } | null>(null);

  const followUpTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (unsavedChanges) {
      setSaveBeforeBackup(true);
    }
  }, [unsavedChanges]);

  useEffect(() => {
    return () => {
      if (followUpTimerRef.current !== null) {
        window.clearTimeout(followUpTimerRef.current);
      }
    };
  }, []);

  const loadBackups = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    const res = await onExecuteCommand(FHEM_LIST_BACKUPS_CMD);
    if (!res.ok) {
      setListError(res.errorMessage || 'Backup-Liste konnte nicht vom FHEM-Server abgerufen werden.');
      setLoadingList(false);
      return;
    }
    const parsed = parseFhemBackupListOutput(res.data);
    setDirectory(parsed.directory);
    setBackups(parsed.backups);
    setListError(parsed.errorHint || null);
    setLoadingList(false);
  }, [onExecuteCommand]);

  useEffect(() => {
    void loadBackups();
  }, [loadBackups]);

  const handleRequestBackup = async () => {
    if (creating) return;
    setCreating(true);
    setCommandFeedback(null);

    try {
      let saveNote = '';
      if (saveBeforeBackup) {
        const saveRes = await onExecuteCommand('save');
        if (!saveRes.ok) {
          setCommandFeedback({
            ok: false,
            message: `Konfiguration konnte vor dem Backup nicht gespeichert werden: ${saveRes.errorMessage || 'Unbekannter Fehler'}`,
            latencyMs: saveRes.latencyMs,
          });
          setCreating(false);
          return;
        }
        saveNote = 'Konfiguration gespeichert (save) · ';
        onAfterSaveConfig?.();
      }

      const backupCmd = followSymlinks ? 'backup symlink' : 'backup';
      const res = await onExecuteCommand(backupCmd);
      if (!res.ok) {
        setCommandFeedback({
          ok: false,
          message: res.errorMessage || `FHEM-Befehl „${backupCmd}“ ist fehlgeschlagen.`,
          latencyMs: res.latencyMs,
        });
      } else {
        const rawOut = (res.data || '').trim();
        const isBackground = /background|hintergrund/i.test(rawOut);
        setCommandFeedback({
          ok: true,
          message: isBackground
            ? `${saveNote}FHEM-Backup wurde im Hintergrund gestartet – die Liste aktualisiert sich automatisch.`
            : `${saveNote}FHEM-Backup erfolgreich angefordert.`,
          output: rawOut || '(OK · keine zusätzliche Server-Ausgabe)',
          latencyMs: res.latencyMs,
        });

        await loadBackups();
        // Real FHEM servers often tar the archive asynchronously in the background
        if (followUpTimerRef.current !== null) {
          window.clearTimeout(followUpTimerRef.current);
        }
        followUpTimerRef.current = window.setTimeout(() => {
          void loadBackups();
        }, 3000);
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCopyPath = async (fullPath: string) => {
    try {
      await navigator.clipboard.writeText(fullPath);
      setCopiedPath(fullPath);
      window.setTimeout(() => setCopiedPath((prev) => (prev === fullPath ? null : prev)), 1800);
    } catch {
      // Clipboard unavailable in restricted context
    }
  };

  const handleDownloadBackup = async (item: FhemServerBackupItem) => {
    if (downloadingFile) return;
    setDownloadingFile(item.filename);
    setDownloadFeedback(null);
    try {
      const res = await downloadFhemBackup(config, item.filename);
      if (res.ok) {
        const sizeLabel = res.sizeBytes ? ` (${formatBytes(res.sizeBytes)})` : '';
        setDownloadFeedback({
          ok: true,
          message: `Backup „${item.filename}“${sizeLabel} wurde auf dein Gerät heruntergeladen.`,
        });
      } else {
        setDownloadFeedback({
          ok: false,
          message: res.errorMessage || `Backup „${item.filename}“ konnte nicht heruntergeladen werden.`,
        });
      }
    } finally {
      setDownloadingFile(null);
    }
  };

  const totalSizeBytes = useMemo(
    () => backups.reduce((acc, item) => acc + (item.sizeBytes || 0), 0),
    [backups]
  );

  const latestBackup = backups[0] || null;
  const latestAgeDays = latestBackup?.mtimeSec
    ? (Date.now() / 1000 - latestBackup.mtimeSec) / 86400
    : null;

  return (
    <div className="space-y-5">
      {/* Summary & Trigger Card */}
      <div className="rounded-2xl border theme-surface p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl theme-tonal">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                FHEM Server-Backups
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Fordere über den FHEM-Befehl <code className="font-mono">backup</code> eine neue Vollsicherung auf dem Server an und prüfe die zuletzt erzeugten Archive.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void loadBackups()}
            disabled={loadingList}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-[#242D3B] dark:bg-[#0E1116] dark:text-slate-200 dark:hover:bg-[#1B222D]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingList ? 'animate-spin' : ''}`} />
            Liste aktualisieren
          </button>
        </div>

        {/* Compact Status Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 dark:border-[#242D3B] dark:bg-[#0E1116]">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <FolderOpen className="h-3.5 w-3.5" />
              Backup-Verzeichnis
            </div>
            <div className="mt-1 truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100" title={directory}>
              {directory}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 dark:border-[#242D3B] dark:bg-[#0E1116]">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <HardDrive className="h-3.5 w-3.5" />
              Erfasste Archive
            </div>
            <div className="mt-1 text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
              {backups.length} {backups.length === 1 ? 'Archiv' : 'Archive'}
              {totalSizeBytes > 0 ? ` · ${formatBytes(totalSizeBytes)}` : ''}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 dark:border-[#242D3B] dark:bg-[#0E1116]">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              Letztes Backup
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
              {latestBackup ? (
                <>
                  <span className="truncate">{formatRelativeAge(latestBackup.mtimeSec)}</span>
                  <span
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      latestAgeDays !== null && latestAgeDays <= 7
                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {latestAgeDays !== null && latestAgeDays <= 7 ? 'Aktuell' : 'Älter'}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">Kein Archiv gefunden</span>
              )}
            </div>
          </div>
        </div>

        {/* Options & Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-[#242D3B] dark:bg-[#0E1116]">
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={saveBeforeBackup}
                onChange={(e) => setSaveBeforeBackup(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-sky-600"
              />
              <Save className="h-3.5 w-3.5 text-slate-500" />
              <span>
                Vorher Konfiguration speichern (<code className="font-mono">save</code>)
              </span>
              {unsavedChanges && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                  ungespeichert
                </span>
              )}
            </label>

            <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={followSymlinks}
                onChange={(e) => setFollowSymlinks(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 accent-sky-600"
              />
              <span>
                Symbolischen Links folgen (<code className="font-mono">backup symlink</code>)
              </span>
            </label>
          </div>

          <button
            type="button"
            onClick={() => void handleRequestBackup()}
            disabled={creating}
            className="flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-xl theme-btn-primary px-5 text-xs font-semibold disabled:opacity-60 transition-opacity"
          >
            {creating ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {creating ? 'Backup wird angefordert...' : 'Backup jetzt anfordern'}
          </button>
        </div>

        {/* Command Feedback Banner */}
        {commandFeedback && (
          <div
            className={`rounded-xl border p-3.5 text-xs space-y-1.5 ${
              commandFeedback.ok
                ? 'border-emerald-300/70 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/30 dark:text-emerald-200'
                : 'border-red-300/70 bg-red-500/10 text-red-800 dark:border-red-500/30 dark:text-red-200'
            }`}
          >
            <div className="flex items-center justify-between gap-2 font-semibold">
              <span className="flex items-center gap-2">
                {commandFeedback.ok ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                )}
                {commandFeedback.message}
              </span>
              {commandFeedback.latencyMs !== undefined && (
                <span className="font-mono text-[11px] opacity-75 tabular-nums">
                  {commandFeedback.latencyMs} ms
                </span>
              )}
            </div>
            {commandFeedback.output && (
              <pre className="overflow-x-auto rounded-lg bg-slate-950/85 px-3 py-2 font-mono text-[11px] text-slate-200 whitespace-pre-wrap break-all">
                {commandFeedback.output}
              </pre>
            )}
          </div>
        )}
      </div>

      {/* Backup Archive List */}
      <div className="rounded-2xl border theme-surface p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Letzte Backups auf dem Server
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Neueste 25 Archive aus <code className="font-mono">{directory}</code> (nach Änderungsdatum sortiert)
            </p>
          </div>
          {isLocalMode && (
            <span className="rounded-lg border border-sky-300/60 bg-sky-500/10 px-2 py-1 text-[10px] font-semibold text-sky-700 dark:border-sky-500/30 dark:text-sky-300">
              Test-Instanz
            </span>
          )}
        </div>

        {listError && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-500/10 p-3.5 text-xs text-amber-900 dark:border-amber-500/30 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="leading-relaxed">{listError}</p>
          </div>
        )}

        {downloadFeedback && (
          <div
            className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs ${
              downloadFeedback.ok
                ? 'border-emerald-300/70 bg-emerald-500/10 text-emerald-900 dark:border-emerald-500/30 dark:text-emerald-200'
                : 'border-red-300/70 bg-red-500/10 text-red-800 dark:border-red-500/30 dark:text-red-200'
            }`}
          >
            {downloadFeedback.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <p className="leading-relaxed">{downloadFeedback.message}</p>
          </div>
        )}

        {loadingList ? (
          <div className="space-y-2 py-2">
            {[0, 1, 2].map((idx) => (
              <div
                key={idx}
                className="h-14 animate-pulse rounded-xl border border-slate-200/70 bg-slate-100/70 dark:border-[#242D3B] dark:bg-[#0E1116]"
              />
            ))}
          </div>
        ) : backups.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300/80 px-4 py-8 text-center dark:border-[#2A3444]">
            <Archive className="mx-auto h-7 w-7 text-slate-400" />
            <p className="mt-2 text-xs font-medium text-slate-700 dark:text-slate-300">
              Noch keine Backup-Archive im Verzeichnis <code className="font-mono">{directory}</code> gefunden.
            </p>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Starte oben ein neues Backup, um die erste Sicherung auf dem FHEM-Server anzulegen.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 rounded-xl border border-slate-200/80 bg-slate-50/50 dark:divide-[#242D3B] dark:border-[#242D3B] dark:bg-[#0E1116]">
            {backups.map((item, idx) => {
              const createdDate = item.mtimeSec
                ? new Date(item.mtimeSec * 1000).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Unbekannt';
              const isCopied = copiedPath === item.fullPath;
              const isDownloadingThis = downloadingFile === item.filename;

              return (
                <div
                  key={item.fullPath}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3.5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {item.filename}
                      </span>
                      {idx === 0 && (
                        <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                          Neuestes
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      <span>{createdDate}</span>
                      {item.mtimeSec > 0 && <span>· {formatRelativeAge(item.mtimeSec)}</span>}
                      <span>· {formatBytes(item.sizeBytes)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleDownloadBackup(item)}
                      disabled={downloadingFile !== null}
                      title={`Backup-Archiv herunterladen: ${item.filename}`}
                      className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg theme-btn-primary px-3 text-[11px] font-semibold disabled:opacity-60 transition-opacity"
                    >
                      {isDownloadingThis ? (
                        <>
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                          Lädt...
                        </>
                      ) : (
                        <>
                          <Download className="h-3.5 w-3.5" />
                          Herunterladen
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleCopyPath(item.fullPath)}
                      title={`Serverpfad kopieren: ${item.fullPath}`}
                      className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 dark:border-[#242D3B] dark:bg-[#161B22] dark:text-slate-200 dark:hover:bg-[#1F2733]"
                    >
                      {isCopied ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          Kopiert
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Pfad
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Helpful FHEM Backup Note */}
      <div className="rounded-2xl border theme-surface p-4 flex items-start gap-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          FHEM speichert Archive standardmäßig unter <code className="font-mono">./backup</code> (anpassbar per{' '}
          <code className="font-mono">attr global backupdir /pfad</code>). Mit{' '}
          <code className="font-mono">attr global backup_before_update 1</code> erstellt FHEM außerdem automatisch vor jedem Update eine Sicherung.
        </p>
      </div>
    </div>
  );
};
