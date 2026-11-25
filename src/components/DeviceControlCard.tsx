import React, {useEffect, useState} from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Blinds,
  ChevronDown,
  ChevronUp,
  DoorClosed,
  DoorOpen,
  Flame,
  GripVertical,
  Lightbulb,
  Maximize2,
  Minimize2,
  Minus,
  Plug,
  Plus,
  Power,
  Radio,
  Square,
  Star,
  Thermometer,
  Trash2,
  Zap,
} from 'lucide-react';
import type {FhemDevice, TileSize} from '../types/fhem';
import {ColorPickerControl} from './ColorPickerControl';

interface DeviceControlCardProps {
  device: FhemDevice;
  isFavorite?: boolean;
  editMode?: boolean;
  compact?: boolean;
  tileSize?: TileSize;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  showZigbeeMetrics?: boolean;
  deviceImage?: string | null;
  isDragOver?: boolean;
  onOpenDetail: (device: FhemDevice) => void;
  onCommand: (cmd: string) => void;
  onToggleFavorite?: (deviceName: string) => void;
  onMoveFavorite?: (deviceName: string, direction: 'up' | 'down') => void;
  onToggleTileSize?: (deviceName: string) => void;
  onDragStartTile?: (deviceName: string) => void;
  onDragOverTile?: (deviceName: string) => void;
  onDropTile?: (targetName: string) => void;
  onDragEndTile?: () => void;
}

export const DeviceControlCard: React.FC<DeviceControlCardProps> = ({
  device,
  isFavorite = false,
  editMode = false,
  compact = false,
  tileSize = 'sm',
  canMoveUp = false,
  canMoveDown = false,
  showZigbeeMetrics = true,
  deviceImage = null,
  isDragOver = false,
  onOpenDetail,
  onCommand,
  onToggleFavorite,
  onMoveFavorite,
  onToggleTileSize,
  onDragStartTile,
  onDragOverTile,
  onDropTile,
  onDragEndTile,
}) => {
  const [localPct, setLocalPct] = useState<number>(device.pct ?? 0);
  const [draggingSlider, setDraggingSlider] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [deviceImage]);

  useEffect(() => {
    if (!draggingSlider && device.pct !== undefined) {
      setLocalPct(device.pct);
    }
  }, [device.pct, draggingSlider]);

  const isWide = tileSize === 'wide';
  const isActive = device.statusTone === 'active';
  const isError = device.statusTone === 'error';
  const isWarning = device.statusTone === 'warning';

  const statusTextClass = isError
    ? 'text-red-600 dark:text-red-400'
    : isWarning
      ? 'text-amber-600 dark:text-amber-400'
      : isActive
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-500 dark:text-slate-400';

  const iconContainerClass = isError
    ? 'bg-red-500/15 text-red-600 dark:text-red-400'
    : isWarning
      ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
      : isActive
        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
        : 'bg-slate-100 text-slate-500 dark:bg-[#232C3A] dark:text-slate-400';

  const renderCategoryIcon = () => {
    const cls = compact ? 'h-4 w-4' : 'h-5 w-5';
    if (isError) return <AlertCircle className={cls} />;
    if (device.category === 'light') return <Lightbulb className={cls} />;
    if (device.category === 'shutter') return <Blinds className={cls} />;
    if (device.category === 'climate') return <Thermometer className={cls} />;
    if (device.category === 'switch') return <Plug className={cls} />;
    if (device.readings.contact) {
      return device.readings.contact.Value === 'open' ? <DoorOpen className={cls} /> : <DoorClosed className={cls} />;
    }
    if (device.power !== undefined) return <Zap className={cls} />;
    if (device.temperature !== undefined) return <Thermometer className={cls} />;
    return <Activity className={cls} />;
  };

  const handleStepTemp = (delta: number) => {
    const base = device.desiredTemp ?? 21.0;
    const next = Math.max(12, Math.min(28, Math.round((base + delta) * 2) / 2));
    onCommand(`set ${device.name} desired-temp ${next.toFixed(1)}`);
  };

  const commitPct = (val: number) => {
    setDraggingSlider(false);
    setLocalPct(val);
    onCommand(`set ${device.name} pct ${val}`);
  };

  // Optional fhemApp appOptions custom reading info readout
  const customInfoReadingKey = device.appOptions?.info?.left1;
  const customInfoReadingVal = customInfoReadingKey ? device.readings[customInfoReadingKey]?.Value : undefined;

  return (
    <article
      draggable={editMode && Boolean(onDragStartTile)}
      onDragStart={(e) => {
        if (!editMode || !onDragStartTile) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', device.name);
        onDragStartTile(device.name);
      }}
      onDragOver={(e) => {
        if (!editMode || !onDragOverTile) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOverTile(device.name);
      }}
      onDrop={(e) => {
        if (!editMode || !onDropTile) return;
        e.preventDefault();
        onDropTile(device.name);
      }}
      onDragEnd={() => onDragEndTile?.()}
      className={`group relative flex flex-col justify-between rounded-2xl border bg-[var(--m3-surface)] transition-all ${
        compact ? 'p-3' : 'p-4'
      } ${isWide ? 'sm:col-span-2' : ''} ${
        editMode ? 'cursor-grab active:cursor-grabbing' : ''
      } ${
        isDragOver
          ? 'ring-2 ring-[var(--accent-ring)] border-[var(--accent-ring)] scale-[1.01]'
          : isError
            ? 'border-red-300/80 dark:border-red-500/40'
            : isActive
              ? 'border-emerald-200/90 dark:border-emerald-500/25'
              : 'theme-border'
      }`}
    >
      {/* Top Row: Icon + Title/Meta + Primary Toggle or Edit Actions */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 flex-1 items-start gap-2.5">
          {editMode && (
            <span
              className="mt-2.5 hidden sm:flex shrink-0 text-slate-400"
              title="Zum Sortieren ziehen"
              aria-hidden="true"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          )}
          <button
            type="button"
            onClick={() => onOpenDetail(device)}
            className="flex min-w-0 flex-1 items-start gap-2.5 text-left focus-visible:outline-none"
          >
            {deviceImage && !imgFailed ? (
              <div
                className={`relative shrink-0 overflow-hidden rounded-2xl border transition-colors ${
                  compact ? 'h-9 w-9' : 'h-11 w-11'
                } ${
                  isError
                    ? 'border-red-400'
                    : isActive
                      ? 'border-emerald-500/70'
                      : 'theme-border'
                }`}
              >
                <img
                  src={deviceImage}
                  alt={device.alias}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              </div>
            ) : (
              <div
                className={`relative flex shrink-0 items-center justify-center rounded-2xl transition-colors ${
                  compact ? 'h-9 w-9' : 'h-11 w-11'
                } ${iconContainerClass}`}
              >
                {renderCategoryIcon()}
                {device.isColorLight && device.rgb && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-[var(--m3-surface)] shadow-xs"
                    style={{backgroundColor: `#${device.rgb}`}}
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h3
                className={`truncate font-semibold text-slate-900 dark:text-slate-100 ${
                  compact ? 'text-[13px]' : 'text-sm'
                }`}
              >
                {device.alias}
              </h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{device.primaryRoom}</span>
                <span aria-hidden="true">·</span>
                <span className={`font-medium tabular-nums ${statusTextClass}`}>{device.statusLabel}</span>
              </div>
            </div>
          </button>
        </div>

        {editMode ? (
          <div className="flex items-center gap-1 shrink-0">
            {onToggleTileSize && (
              <button
                type="button"
                onClick={() => onToggleTileSize(device.name)}
                aria-label={isWide ? 'Kachel auf Standardbreite (1x1) verkleinern' : 'Kachel auf Doppelbreite (2x1) vergrößern'}
                title={isWide ? 'Standardbreite (1×1)' : 'Breite Kachel (2×1)'}
                className={`flex h-10 w-10 items-center justify-center rounded-xl transition-colors ${
                  isWide
                    ? 'theme-tonal'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-300'
                }`}
              >
                {isWide ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </button>
            )}
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => onMoveFavorite?.(device.name, 'up')}
              aria-label="Nach oben verschieben"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-35 dark:bg-[#1B222D] dark:text-slate-300"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => onMoveFavorite?.(device.name, 'down')}
              aria-label="Nach unten verschieben"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-35 dark:bg-[#1B222D] dark:text-slate-300"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onToggleFavorite?.(device.name)}
              aria-label="Aus Favoriten entfernen"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/12 text-red-600 hover:bg-red-500/20 dark:text-red-400"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : device.isSwitchable ? (
          <button
            type="button"
            onClick={() => onCommand(`set ${device.name} ${isActive ? 'off' : 'on'}`)}
            aria-label={`${device.alias} ${isActive ? 'ausschalten' : 'einschalten'}`}
            className={`flex shrink-0 items-center justify-center rounded-2xl transition-colors active:scale-95 ${
              compact ? 'h-10 w-10' : 'h-11 w-11'
            } ${
              isActive
                ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-[#1B222D] dark:text-slate-300 dark:hover:bg-[#232C3A]'
            }`}
          >
            <Power className={compact ? 'h-4.5 w-4.5' : 'h-5 w-5'} />
          </button>
        ) : (
          onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(device.name)}
              aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1B222D]"
            >
              <Star className={`h-4 w-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
          )
        )}
      </div>

      {/* Contextual Interactive Controls */}
      {!editMode && (
        <div className={compact ? 'mt-2.5' : 'mt-3.5'}>
          {/* Dimmer Slider */}
          {device.isDimmable && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Helligkeit</span>
                <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                  {localPct}%{device.ct ? ` · ${device.ct} K` : ''}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={localPct}
                aria-label={`${device.alias} Helligkeit`}
                onChange={(e) => {
                  setDraggingSlider(true);
                  setLocalPct(Number(e.target.value));
                }}
                onMouseUp={() => commitPct(localPct)}
                onTouchEnd={() => commitPct(localPct)}
                onKeyUp={() => commitPct(localPct)}
                className="m3-slider w-full"
                style={{
                  background: `linear-gradient(to right, ${isActive ? '#22C55E' : 'var(--accent-primary)'} ${localPct}%, rgba(148,163,184,0.28) ${localPct}%)`,
                  borderRadius: '9999px',
                  height: '10px',
                }}
              />
              {/* Wide Tile Quick Dimmer & Color Temp Presets (EasyTiley style) */}
              {isWide && (
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    {[25, 50, 75, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => commitPct(preset)}
                        className={`min-h-[36px] rounded-xl px-2.5 font-mono text-xs font-semibold tabular-nums transition-colors ${
                          localPct === preset && isActive
                            ? 'theme-btn-primary'
                            : 'theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-300'
                        }`}
                      >
                        {preset}%
                      </button>
                    ))}
                  </div>
                  {device.possibleSets.includes('ct') && (
                    <div className="flex items-center gap-1.5">
                      {[
                        {label: 'Warm', k: 2400},
                        {label: 'Neutral', k: 3400},
                        {label: 'Kalt', k: 5500},
                      ].map((ctPreset) => (
                        <button
                          key={ctPreset.k}
                          type="button"
                          onClick={() => onCommand(`set ${device.name} ct ${ctPreset.k}`)}
                          className="min-h-[36px] rounded-xl theme-surface-alt px-2.5 text-xs font-medium text-slate-700 hover:opacity-85 dark:text-slate-300"
                        >
                          {ctPreset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {/* Compact RGB Quick Swatches & Native Color Picker */}
              {device.isColorLight && !compact && (
                <ColorPickerControl
                  deviceAlias={device.alias}
                  rgb={device.rgb}
                  variant="compact"
                  onChangeRgb={(hex) => onCommand(`set ${device.name} rgb ${hex}`)}
                />
              )}
            </div>
          )}

          {/* Non-dimmable RGB Color Light Fallback */}
          {!device.isDimmable && device.isColorLight && !compact && (
            <ColorPickerControl
              deviceAlias={device.alias}
              rgb={device.rgb}
              variant="compact"
              onChangeRgb={(hex) => onCommand(`set ${device.name} rgb ${hex}`)}
            />
          )}

          {/* Shutter Controls */}
          {device.isShutter && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onCommand(`set ${device.name} up`)}
                    aria-label="Rollladen hochfahren"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 dark:bg-[#1B222D] dark:text-slate-200 dark:hover:bg-[#232C3A]"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCommand(`set ${device.name} stop`)}
                    aria-label="Rollladen stoppen"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 dark:bg-[#1B222D] dark:text-slate-200 dark:hover:bg-[#232C3A]"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCommand(`set ${device.name} down`)}
                    aria-label="Rollladen herunterfahren"
                    className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 dark:bg-[#1B222D] dark:text-slate-200 dark:hover:bg-[#232C3A]"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {localPct}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={localPct}
                aria-label={`${device.alias} Position`}
                onChange={(e) => {
                  setDraggingSlider(true);
                  setLocalPct(Number(e.target.value));
                }}
                onMouseUp={() => commitPct(localPct)}
                onTouchEnd={() => commitPct(localPct)}
                onKeyUp={() => commitPct(localPct)}
                className="m3-slider w-full"
                style={{
                  background: `linear-gradient(to right, var(--accent-primary) ${localPct}%, rgba(148,163,184,0.28) ${localPct}%)`,
                  borderRadius: '9999px',
                  height: '10px',
                }}
              />
              {isWide && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {[
                    {label: 'Zu (0%)', val: 0},
                    {label: '25%', val: 25},
                    {label: '50%', val: 50},
                    {label: '75%', val: 75},
                    {label: 'Offen (100%)', val: 100},
                  ].map((pos) => (
                    <button
                      key={pos.val}
                      type="button"
                      onClick={() => commitPct(pos.val)}
                      className={`min-h-[36px] rounded-xl px-2.5 text-xs font-semibold tabular-nums transition-colors ${
                        localPct === pos.val
                          ? 'theme-btn-primary'
                          : 'theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-300'
                      }`}
                    >
                      {pos.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Thermostat Stepper */}
          {device.isThermostat && (
            <div className="space-y-2.5 pt-0.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Ist {device.temperature?.toFixed(1) ?? '--'} °C · Ventil {device.readings.valve?.Value ?? '0'}%
                  </div>
                  <div className="font-display text-xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {device.desiredTemp?.toFixed(1) ?? '--'} °C
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStepTemp(-0.5)}
                    aria-label="Solltemperatur senken"
                    className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 dark:bg-[#1B222D] dark:text-slate-200 dark:hover:bg-[#232C3A]"
                  >
                    <Minus className="h-4.5 w-4.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStepTemp(0.5)}
                    aria-label="Solltemperatur erhöhen"
                    className="flex h-11 w-11 items-center justify-center rounded-xl theme-tonal hover:opacity-90 active:scale-95 transition-opacity"
                  >
                    <Plus className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
              {isWide && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {(
                    [
                      {cmd: 'auto', label: 'Auto'},
                      {cmd: 'manual', label: 'Manuell'},
                      {cmd: 'boost', label: 'Boost'},
                    ] as const
                  ).map((mode) => {
                    const currentMode = device.readings.controlMode?.Value?.toLowerCase();
                    const activeMode = currentMode === mode.cmd;
                    return (
                      <button
                        key={mode.cmd}
                        type="button"
                        onClick={() => onCommand(`set ${device.name} ${mode.cmd}`)}
                        className={`flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold transition-colors ${
                          activeMode
                            ? 'theme-btn-primary'
                            : 'theme-surface-alt text-slate-700 hover:opacity-85 dark:text-slate-300'
                        }`}
                      >
                        {mode.cmd === 'boost' && <Flame className="h-3.5 w-3.5" />}
                        {mode.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Sensor / Power Metric Readout */}
          {!device.isDimmable && !device.isShutter && !device.isThermostat && (
            <div className="flex items-baseline justify-between gap-2 pt-0.5">
              <div className={`font-display font-bold tabular-nums text-slate-900 dark:text-slate-100 ${compact ? 'text-base' : 'text-lg'}`}>
                {device.temperature !== undefined
                  ? `${device.temperature.toFixed(1)} °C`
                  : device.power !== undefined
                    ? `${device.power.toFixed(1)} W`
                    : device.statusLabel}
              </div>
              <div className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
                {device.humidity !== undefined && `${device.humidity}% rF`}
                {device.readings.energy && `${device.readings.energy.Value} kWh`}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Unboxed Clean Metadata Footer (Zero-Pill Discipline) */}
      {showZigbeeMetrics && !compact && (
        <div className="mt-3 flex items-center justify-between border-t theme-border pt-2.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1.5 truncate">
            {device.isZigbee && <Radio className="h-3 w-3 shrink-0 theme-text" />}
            <span>{device.isZigbee ? 'ZigBee' : device.type}</span>
            {device.linkquality !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">LQI {device.linkquality}</span>
              </>
            )}
            {device.battery !== undefined && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className={`font-mono tabular-nums ${
                    device.battery <= 20 ? 'font-semibold text-amber-600 dark:text-amber-400' : ''
                  }`}
                >
                  {device.battery}% Bat
                </span>
              </>
            )}
            {customInfoReadingKey && customInfoReadingVal && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {customInfoReadingKey}: {customInfoReadingVal}
                </span>
              </>
            )}
          </span>
          <span className="font-mono tabular-nums shrink-0 ml-2">
            {device.stateTime ? device.stateTime.slice(11, 16) : ''}
          </span>
        </div>
      )}
    </article>
  );
};
