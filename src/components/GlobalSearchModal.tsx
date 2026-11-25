import React, {useEffect, useMemo, useRef, useState} from 'react';
import {ChevronRight, Power, Search, X} from 'lucide-react';
import type {FhemDevice} from '../types/fhem';

interface GlobalSearchModalProps {
  open: boolean;
  devices: FhemDevice[];
  onClose: () => void;
  onSelectDevice: (device: FhemDevice) => void;
  onQuickCommand: (cmd: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  open,
  devices,
  onClose,
  onSelectDevice,
  onQuickCommand,
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 40);
    } else {
      setQuery('');
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices.slice(0, 12).map((d) => ({device: d, matchContext: `${d.primaryRoom} · ${d.type}`}));

    const scored: Array<{device: FhemDevice; score: number; matchContext: string}> = [];

    for (const d of devices) {
      if (d.alias.toLowerCase().includes(q)) {
        scored.push({device: d, score: 100, matchContext: `Alias · ${d.primaryRoom}`});
        continue;
      }
      if (d.name.toLowerCase().includes(q)) {
        scored.push({device: d, score: 90, matchContext: `Name · ${d.primaryRoom}`});
        continue;
      }
      if (d.rooms.some((r) => r.toLowerCase().includes(q))) {
        scored.push({device: d, score: 75, matchContext: `Raum: ${d.rooms.join(', ')}`});
        continue;
      }
      if (d.type.toLowerCase().includes(q) || (d.model && d.model.toLowerCase().includes(q))) {
        scored.push({device: d, score: 65, matchContext: `${d.type}${d.model ? ` · ${d.model}` : ''}`});
        continue;
      }
      // Search across ALL readings (keys and values)
      let readingMatch = '';
      for (const [rKey, rVal] of Object.entries(d.readings)) {
        if (rKey.toLowerCase().includes(q) || rVal.Value.toLowerCase().includes(q)) {
          readingMatch = `Reading ${rKey}: ${rVal.Value}`;
          break;
        }
      }
      if (readingMatch) {
        scored.push({device: d, score: 50, matchContext: readingMatch});
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 35)
      .map(({device, matchContext}) => ({device, matchContext}));
  }, [devices, query]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 backdrop-blur-xs p-3 sm:pt-16"
      role="dialog"
      aria-modal="true"
      aria-label="Globale Gerätesuche"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[82vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border theme-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b theme-border px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suche nach Gerätename, Alias, Raum oder Reading (z. B. low, open, 21.4, ZigBee)..."
            className="min-h-[44px] w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Suchfeld leeren"
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-white/[0.08]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-xl px-3 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.08]"
          >
            Esc
          </button>
        </div>

        {/* Quick Filter Hints */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b theme-border px-4 py-2">
          {['open', 'offline', 'battery', 'ZigBee', 'Rollladen', 'DOIF', 'Wohnzimmer'].map((hint) => (
            <button
              key={hint}
              type="button"
              onClick={() => setQuery(hint)}
              className="min-h-[34px] rounded-lg theme-surface-alt px-2.5 text-xs font-medium text-slate-600 hover:opacity-85 dark:text-slate-300 whitespace-nowrap shrink-0"
            >
              {hint}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-white/[0.06]">
          {results.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Keine Geräte oder Readings für „{query}“ gefunden.
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Prüfe Schreibweise oder suche nach einem Raum- oder Reading-Wert.
              </p>
            </div>
          ) : (
            results.map(({device, matchContext}) => {
              const statusColor =
                device.statusTone === 'active'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : device.statusTone === 'error'
                    ? 'text-red-600 dark:text-red-400'
                    : device.statusTone === 'warning'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-slate-500 dark:text-slate-400';

              return (
                <div
                  key={device.name}
                  className="flex min-h-[60px] items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[#1B222D]/80"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDevice(device);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 flex-col items-start text-left"
                  >
                    <span className="truncate w-full text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {device.alias}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono text-[11px]">{device.name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{matchContext}</span>
                    </span>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${statusColor}`}>
                      {device.statusLabel}
                    </span>
                    {device.isSwitchable && (
                      <button
                        type="button"
                        onClick={() => onQuickCommand(`set ${device.name} ${device.statusTone === 'active' ? 'off' : 'on'}`)}
                        aria-label={`${device.alias} umschalten`}
                        className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                          device.statusTone === 'active'
                            ? 'bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/25 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-[#232C3A] dark:text-slate-300'
                        }`}
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectDevice(device);
                        onClose();
                      }}
                      aria-label={`${device.alias} Details`}
                      className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-[#232C3A]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200/80 px-4 py-2.5 text-xs text-slate-500 dark:border-[#242D3B] dark:text-slate-400">
          <span className="tabular-nums">{results.length} Treffer von {devices.length} Geräten</span>
          <span>Durchsucht Name, Alias, Raum, Typ & Readings</span>
        </div>
      </div>
    </div>
  );
};
