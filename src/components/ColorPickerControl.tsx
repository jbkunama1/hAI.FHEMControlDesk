import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Palette, Pipette} from 'lucide-react';
import {normalizeRgbHex} from '../lib/fhemClient';

export interface ColorPreset {
  name: string;
  hex: string; // 6-char uppercase without '#'
}

export const SMART_HOME_COLOR_PRESETS: ColorPreset[] = [
  {name: 'Warmweiß', hex: 'FFD4A3'},
  {name: 'Kerzenschein', hex: 'FF9329'},
  {name: 'Sonnenuntergang', hex: 'FF5E3A'},
  {name: 'Koralle', hex: 'F43F5E'},
  {name: 'Lavendel', hex: '8B5CF6'},
  {name: 'Ozeanblau', hex: '0EA5E9'},
  {name: 'Smaragd', hex: '10B981'},
  {name: 'Tageslicht', hex: 'F5F9FF'},
];

function hexToHsv(hex: string): {h: number; s: number; v: number} {
  const clean = normalizeRgbHex(hex) || 'FFD4A3';
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : d / max;
  return {h, s, v: max};
}

function hsvToHex(h: number, s: number, v: number): string {
  const hue = ((h % 360) + 360) % 360;
  const sat = Math.max(0, Math.min(1, s));
  const val = Math.max(0, Math.min(1, v));

  const c = val * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = val - c;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
      .toUpperCase();

  return `${toHex(r)}${toHex(g)}${toHex(b)}`;
}

interface ColorPickerControlProps {
  deviceAlias: string;
  rgb?: string;
  variant?: 'full' | 'compact';
  onChangeRgb: (hexWithoutHash: string) => void;
}

export const ColorPickerControl: React.FC<ColorPickerControlProps> = ({
  deviceAlias,
  rgb,
  variant = 'full',
  onChangeRgb,
}) => {
  const normalizedCurrent = normalizeRgbHex(rgb) || 'FFD4A3';
  const [localHex, setLocalHex] = useState(normalizedCurrent);
  const [draggingHue, setDraggingHue] = useState(false);
  const nativeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!draggingHue) {
      setLocalHex(normalizedCurrent);
    }
  }, [normalizedCurrent, draggingHue]);

  const hsv = useMemo(() => hexToHsv(localHex), [localHex]);
  const [hueVal, setHueVal] = useState(hsv.h);

  useEffect(() => {
    if (!draggingHue) {
      setHueVal(hexToHsv(normalizedCurrent).h);
    }
  }, [normalizedCurrent, draggingHue]);

  const commitHex = (hex: string) => {
    const clean = normalizeRgbHex(hex);
    if (!clean) return;
    setDraggingHue(false);
    setLocalHex(clean);
    onChangeRgb(clean);
  };

  const handleHueDrag = (nextHue: number) => {
    setDraggingHue(true);
    setHueVal(nextHue);
    const sat = hsv.s < 0.35 ? 0.85 : hsv.s;
    const val = hsv.v < 0.5 ? 1 : hsv.v;
    setLocalHex(hsvToHex(nextHue, sat, val));
  };

  const handleHueCommit = () => {
    const sat = hsv.s < 0.35 ? 0.85 : hsv.s;
    const val = hsv.v < 0.5 ? 1 : hsv.v;
    const finalHex = hsvToHex(hueVal, sat, val);
    commitHex(finalHex);
  };

  if (variant === 'compact') {
    const compactPresets = SMART_HOME_COLOR_PRESETS.slice(0, 6);
    return (
      <div className="flex items-center justify-between gap-2 pt-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {compactPresets.map((preset) => {
            const isSelected = localHex === preset.hex;
            return (
              <button
                key={preset.hex}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  commitHex(preset.hex);
                }}
                aria-label={`${deviceAlias}: Farbe ${preset.name}`}
                title={`${preset.name} (#${preset.hex})`}
                className={`relative flex h-7 w-7 items-center justify-center rounded-full border transition-transform active:scale-90 ${
                  isSelected
                    ? 'scale-105 border-slate-900 ring-2 ring-[var(--accent-ring)] dark:border-white'
                    : 'border-black/15 hover:scale-105 dark:border-white/20'
                }`}
                style={{backgroundColor: `#${preset.hex}`}}
              />
            );
          })}
        </div>

        <label
          onClick={(e) => e.stopPropagation()}
          title={`Freie Farbe für ${deviceAlias} wählen (#${localHex})`}
          className="relative flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl theme-surface-alt border theme-border px-2 text-[11px] font-mono font-semibold text-slate-700 hover:opacity-90 dark:text-slate-200"
        >
          <span
            className="h-3.5 w-3.5 rounded-full border border-black/20 dark:border-white/25 shrink-0"
            style={{backgroundColor: `#${localHex}`}}
            aria-hidden="true"
          />
          <Palette className="h-3.5 w-3.5 opacity-75" />
          <input
            type="color"
            aria-label={`${deviceAlias} Farbwähler`}
            value={`#${localHex.toLowerCase()}`}
            onChange={(e) => {
              const clean = normalizeRgbHex(e.target.value);
              if (clean) commitHex(clean);
            }}
            className="sr-only"
          />
        </label>
      </div>
    );
  }

  return (
    <div className="space-y-3.5 border-t border-slate-100 pt-3.5 dark:border-[#1F2734]">
      {/* Header + Live Preview + Native Color Picker */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="h-6 w-6 shrink-0 rounded-full border border-black/15 shadow-xs dark:border-white/25"
            style={{backgroundColor: `#${localHex}`}}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Lichtfarbe (RGB)
            </div>
            <div className="font-mono text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
              #{localHex}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <input
            ref={nativeInputRef}
            type="color"
            aria-label={`${deviceAlias} freie RGB-Farbe`}
            value={`#${localHex.toLowerCase()}`}
            onChange={(e) => {
              const clean = normalizeRgbHex(e.target.value);
              if (clean) commitHex(clean);
            }}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => nativeInputRef.current?.click()}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl border theme-border theme-surface-alt px-3 text-xs font-semibold text-slate-700 hover:opacity-90 active:scale-95 transition-all dark:text-slate-200"
          >
            <Pipette className="h-3.5 w-3.5 theme-text" />
            Farbkreis
          </button>
        </div>
      </div>

      {/* Hue Spectrum Bar */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
          <span>Farbton-Spektrum</span>
          <span className="font-mono tabular-nums">{hueVal}°</span>
        </div>
        <input
          type="range"
          min={0}
          max={359}
          step={1}
          value={hueVal}
          aria-label={`${deviceAlias} Farbton`}
          onChange={(e) => handleHueDrag(Number(e.target.value))}
          onMouseUp={handleHueCommit}
          onTouchEnd={handleHueCommit}
          onKeyUp={handleHueCommit}
          className="m3-slider w-full"
          style={{
            background:
              'linear-gradient(to right, #FF0000 0%, #FFFF00 17%, #00FF00 33%, #00FFFF 50%, #0000FF 67%, #FF00FF 83%, #FF0000 100%)',
            borderRadius: '9999px',
            height: '12px',
          }}
        />
      </div>

      {/* Curated Smart Home Mood Presets */}
      <div>
        <div className="mb-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
          Lichtstimmungen
        </div>
        <div className="grid grid-cols-4 gap-2">
          {SMART_HOME_COLOR_PRESETS.map((preset) => {
            const isSelected = localHex === preset.hex;
            return (
              <button
                key={preset.hex}
                type="button"
                onClick={() => commitHex(preset.hex)}
                className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[11px] font-medium transition-all active:scale-95 ${
                  isSelected
                    ? 'border-[var(--accent-ring)] theme-tonal'
                    : 'theme-border bg-slate-50/70 text-slate-700 hover:bg-slate-100 dark:bg-[#131922] dark:text-slate-300 dark:hover:bg-[#1B222D]'
                }`}
              >
                <span
                  className="h-4 w-4 rounded-full border border-black/15 dark:border-white/20 shrink-0"
                  style={{backgroundColor: `#${preset.hex}`}}
                  aria-hidden="true"
                />
                <span className="truncate max-w-full">{preset.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
