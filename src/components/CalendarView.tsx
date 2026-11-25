import React, {useMemo, useState} from 'react';
import {
  Bell,
  CalendarRange,
  Clock,
  GitBranch,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Sunset,
  Zap,
} from 'lucide-react';
import type {FhemDevice, ScheduleEntry} from '../types/fhem';
import {extractSchedulesFromDevices} from '../lib/fhemClient';

interface CalendarViewProps {
  devices: FhemDevice[];
  onCommand: (cmd: string) => void;
  onOpenDetail: (device: FhemDevice) => void;
  onOpenDefineSchedule: () => void;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_FULL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

type AutoFilter = 'all' | 'at' | 'DOIF' | 'WeekdayTimer' | 'notify' | 'watchdog' | 'scene';

export const CalendarView: React.FC<CalendarViewProps> = ({
  devices,
  onCommand,
  onOpenDetail,
  onOpenDefineSchedule,
}) => {
  const jsDay = new Date().getDay();
  const todayIdx = jsDay === 0 ? 6 : jsDay - 1; // 0=Mo..6=So
  const [selectedDay, setSelectedDay] = useState<number>(todayIdx);
  const [autoFilter, setAutoFilter] = useState<AutoFilter>('all');

  const allSchedules = useMemo(() => extractSchedulesFromDevices(devices), [devices]);

  const daySchedules = useMemo(
    () => allSchedules.filter((s) => s.days.includes(selectedDay)),
    [allSchedules, selectedDay]
  );

  const automationDevices = useMemo(() => {
    return devices.filter((d) => {
      if (autoFilter === 'all') return d.category === 'automation' || d.category === 'scene';
      if (autoFilter === 'scene') return d.category === 'scene';
      return d.type.toLowerCase() === autoFilter.toLowerCase();
    });
  }, [devices, autoFilter]);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nowPercent = (nowMinutes / 1440) * 100;

  const findDevice = (name: string) => devices.find((d) => d.name === name);

  const handleToggleDisable = (device: FhemDevice) => {
    const nextDisable = device.disabled ? '0' : '1';
    onCommand(`attr ${device.name} disable ${nextDisable}`);
  };

  const handleTriggerNow = (device: FhemDevice) => {
    if (device.type === 'at') {
      onCommand(`set ${device.name} execNow`);
    } else if (device.type === 'DOIF') {
      onCommand(`set ${device.name} cmd_1`);
    } else if (device.type === 'watchdog') {
      onCommand(`set ${device.name} reset`);
    } else {
      onCommand(`trigger ${device.name}`);
    }
  };

  const renderAutoIcon = (type: string) => {
    const lower = type.toLowerCase();
    if (lower === 'at') return <Clock className="h-4.5 w-4.5" />;
    if (lower === 'doif') return <GitBranch className="h-4.5 w-4.5" />;
    if (lower === 'weekdaytimer') return <CalendarRange className="h-4.5 w-4.5" />;
    if (lower === 'notify') return <Bell className="h-4.5 w-4.5" />;
    if (lower === 'watchdog') return <ShieldCheck className="h-4.5 w-4.5" />;
    return <Sparkles className="h-4.5 w-4.5" />;
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
            Kalender & Automatisierungen
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {allSchedules.length} Schaltzeiten (at / DOIF / WeekdayTimer) · {devices.filter((d) => d.category === 'automation').length} Regeln aktiv verwaltet
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenDefineSchedule}
          className="flex min-h-[44px] items-center gap-1.5 rounded-xl theme-btn-primary px-4 text-xs font-semibold transition-colors whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          Zeitplan erstellen (at)
        </button>
      </div>

      {/* Weekday Selector + 24h Timeline Card */}
      <section className="rounded-2xl border theme-surface p-4 sm:p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Tageszeitplan · {WEEKDAYS_FULL[selectedDay]}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {daySchedules.length} geplante Aktionen · Sonnenaufgang ~07:42 · Sonnenuntergang ~17:18
            </p>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day, idx) => {
              const isSelected = selectedDay === idx;
              const isToday = todayIdx === idx;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDay(idx)}
                  className={`flex min-h-[42px] min-w-[40px] flex-col items-center justify-center rounded-xl text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'theme-btn-primary'
                      : isToday
                        ? 'theme-tonal'
                        : 'theme-surface-alt text-slate-600 hover:opacity-85 dark:text-slate-300'
                  }`}
                >
                  <span>{day}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 24-Hour Horizontal Visual Timeline */}
        <div className="rounded-2xl theme-surface-alt p-4 border theme-border">
          <div className="relative h-14 w-full">
            {/* Base Track */}
            <div className="absolute left-0 right-0 top-7 h-2 rounded-full bg-slate-200 dark:bg-white/[0.08]" />

            {/* Daylight Band (approx 07:30 - 17:20) */}
            <div
              className="absolute top-7 h-2 rounded-full bg-amber-400/35 dark:bg-amber-400/25"
              style={{left: '31%', width: '41%'}}
              title="Tageslichtfenster"
            />

            {/* Current Time Vertical Marker */}
            {selectedDay === todayIdx && (
              <div
                className="absolute top-1 bottom-1 w-0.5 theme-dot z-10"
                style={{left: `${nowPercent}%`}}
                title={`Aktuelle Uhrzeit: ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}
              >
                <span className="absolute -top-1 -left-1.5 h-3 w-3 rounded-full theme-dot" />
              </div>
            )}

            {/* Schedule Event Pins */}
            {daySchedules.map((sch: ScheduleEntry) => {
              const leftPct = (sch.timeMinutes / 1440) * 100;
              const dev = findDevice(sch.deviceName);
              return (
                <button
                  key={sch.id}
                  type="button"
                  onClick={() => dev && onOpenDetail(dev)}
                  title={`${sch.timeLabel} — ${sch.alias}${sch.branchLabel ? ` (${sch.branchLabel})` : ''} [${sch.type}]`}
                  style={{left: `${leftPct}%`}}
                  className={`absolute top-4 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white dark:border-[var(--m3-canvas)] transition-transform hover:scale-110 z-20 ${
                    !sch.active
                      ? 'bg-slate-400 text-white'
                      : sch.type === 'at'
                        ? 'bg-emerald-600 text-white'
                        : sch.type === 'WeekdayTimer'
                          ? 'bg-amber-600 text-white'
                          : 'theme-btn-primary'
                  }`}
                >
                  {sch.solarType === 'sunset' ? (
                    <Sunset className="h-3.5 w-3.5" />
                  ) : sch.solarType === 'sunrise' ? (
                    <Sunrise className="h-3.5 w-3.5" />
                  ) : sch.type === 'WeekdayTimer' ? (
                    <CalendarRange className="h-3.5 w-3.5" />
                  ) : sch.type === 'DOIF' ? (
                    <GitBranch className="h-3.5 w-3.5" />
                  ) : (
                    <Clock className="h-3.5 w-3.5" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Time axis ticks */}
          <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-slate-400">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>

        {/* Chronological Schedule Rows for Selected Day */}
        <div className="divide-y divide-slate-100 dark:divide-[#1F2734]">
          {daySchedules.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Keine zeitgesteuerten Aktionen für {WEEKDAYS_FULL[selectedDay]}.
            </div>
          ) : (
            daySchedules.map((sch) => {
              const dev = findDevice(sch.deviceName);
              return (
                <div
                  key={sch.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5"
                >
                  <button
                    type="button"
                    onClick={() => dev && onOpenDetail(dev)}
                    className="flex min-w-0 flex-1 items-start gap-3.5 text-left"
                  >
                    <div className="w-16 shrink-0 pt-0.5">
                      <div className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                        {sch.timeLabel}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {sch.isSolar ? (sch.solarType === 'sunset' ? 'Sunset' : 'Sunrise') : sch.type}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {sch.alias}
                        </span>
                        {sch.branchLabel && (
                          <span className="text-xs font-semibold theme-text">
                            · {sch.branchLabel}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className={sch.active ? 'font-medium text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>
                          {sch.active ? 'Aktiv' : 'Pausiert'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{sch.room}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono text-[11px] truncate max-w-md">{sch.commandSummary}</span>
                      </div>
                    </div>
                  </button>

                  {dev && (
                    <div className="flex items-center gap-1.5 shrink-0 pl-17 sm:pl-0">
                      <button
                        type="button"
                        onClick={() => handleTriggerNow(dev)}
                        title="Jetzt ausführen"
                        className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-200 dark:hover:bg-[#232C3A]"
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Auslösen
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleDisable(dev)}
                        aria-label={dev.disabled ? 'Aktivieren' : 'Pausieren'}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                          dev.disabled
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-300'
                        }`}
                      >
                        {dev.disabled ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Complete Automations & Scenes Overview */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Szenen & Automatisierungen
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Übersicht über DOIF, at, WeekdayTimer, notify, watchdog und Lichtszenen mit Live-Zustand
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            {(
              [
                {id: 'all', label: 'Alle'},
                {id: 'DOIF', label: 'DOIF'},
                {id: 'at', label: 'at'},
                {id: 'WeekdayTimer', label: 'WeekdayTimer'},
                {id: 'notify', label: 'notify'},
                {id: 'watchdog', label: 'watchdog'},
                {id: 'scene', label: 'Szenen'},
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAutoFilter(tab.id)}
                className={`min-h-[38px] rounded-xl px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  autoFilter === tab.id
                    ? 'theme-btn-primary'
                    : 'border theme-surface text-slate-700 hover:border-[var(--accent-ring)] dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {automationDevices.map((dev) => {
            const isWarn = dev.statusTone === 'warning' || dev.statusTone === 'error';
            const isActive = dev.statusTone === 'active' && !dev.disabled;

            return (
              <div
                key={dev.name}
                className="flex flex-col justify-between rounded-2xl border theme-surface p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenDetail(dev)}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left"
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isWarn
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : isActive
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-100 text-slate-500 dark:bg-[#232C3A] dark:text-slate-400'
                      }`}
                    >
                      {renderAutoIcon(dev.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {dev.alias}
                      </h3>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-mono text-[11px]">{dev.type}</span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-semibold ${
                            isWarn
                              ? 'text-amber-600 dark:text-amber-400'
                              : isActive
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {dev.statusLabel}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{dev.primaryRoom}</span>
                      </div>
                    </div>
                  </button>

                  {dev.category === 'automation' && (
                    <button
                      type="button"
                      onClick={() => handleToggleDisable(dev)}
                      className={`min-h-[38px] rounded-xl px-3 text-xs font-semibold whitespace-nowrap shrink-0 ${
                        dev.disabled
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-300'
                      }`}
                    >
                      {dev.disabled ? 'Aktivieren' : 'Pausieren'}
                    </button>
                  )}
                </div>

                {dev.def && (
                  <code className="mt-3 block truncate rounded-xl bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-600 dark:bg-[#0E1116] dark:text-slate-400">
                    {dev.def}
                  </code>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
