import React from 'react';
import {Check, Moon, Palette, Sun, X} from 'lucide-react';
import type {ColorThemeId} from '../types/fhem';
import {COLOR_THEMES} from '../lib/themes';

interface ThemeGalleryProps {
  mode: 'dark' | 'light';
  colorTheme: ColorThemeId;
  onSelectMode: (mode: 'dark' | 'light') => void;
  onSelectColorTheme: (id: ColorThemeId) => void;
}

export const ThemeGallery: React.FC<ThemeGalleryProps> = ({
  mode,
  colorTheme,
  onSelectMode,
  onSelectColorTheme,
}) => {
  return (
    <div className="space-y-4">
      {/* Dark / Light Mode Segmented Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Helligkeitsmodus</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Jedes Farbtheme unterstützt Dunkel- und Hellmodus.
          </div>
        </div>
        <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-[#0E1116]">
          <button
            type="button"
            onClick={() => onSelectMode('dark')}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
              mode === 'dark' ? 'theme-tonal' : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Moon className="h-3.5 w-3.5" />
            Dunkel
          </button>
          <button
            type="button"
            onClick={() => onSelectMode('light')}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-lg px-3.5 text-xs font-semibold transition-colors ${
              mode === 'light'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            <Sun className="h-3.5 w-3.5" />
            Hell
          </button>
        </div>
      </div>

      {/* 6 Curated Material 3 Color Themes */}
      <div>
        <div className="mb-2.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          Farbtheme auswählen
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {COLOR_THEMES.map((t) => {
            const active = colorTheme === t.id;
            const canvasPreview = mode === 'dark' ? t.darkCanvas : t.lightCanvas;
            const containerPreview = mode === 'dark' ? t.swatchContainerDark : t.swatchContainerLight;

            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectColorTheme(t.id)}
                className={`flex min-h-[76px] items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                  active
                    ? 'border-[var(--accent-ring)] theme-tonal'
                    : 'theme-surface hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Live 3-tone mini swatch preview */}
                  <div
                    className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-black/10 dark:border-white/10 overflow-hidden"
                    style={{backgroundColor: canvasPreview}}
                    aria-hidden="true"
                  >
                    <span
                      className="absolute inset-x-1.5 top-1.5 h-3.5 rounded-md"
                      style={{backgroundColor: containerPreview}}
                    />
                    <span
                      className="absolute bottom-1.5 left-1.5 right-1.5 h-3.5 rounded-md"
                      style={{backgroundColor: t.swatchPrimary}}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {t.name}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {t.description}
                    </div>
                  </div>
                </div>

                {active && (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full theme-btn-primary">
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface ThemeModalProps {
  open: boolean;
  mode: 'dark' | 'light';
  colorTheme: ColorThemeId;
  onClose: () => void;
  onSelectMode: (mode: 'dark' | 'light') => void;
  onSelectColorTheme: (id: ColorThemeId) => void;
}

export const ThemeQuickModal: React.FC<ThemeModalProps> = ({
  open,
  mode,
  colorTheme,
  onClose,
  onSelectMode,
  onSelectColorTheme,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Theme auswählen"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl sm:rounded-3xl border theme-surface p-6 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-700 sm:hidden" />
        <div className="flex items-center justify-between gap-4 pb-4 border-b theme-border">
          <div className="flex items-center gap-2.5">
            <Palette className="h-5 w-5 theme-text" />
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Design & Farbthemes
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Schließen"
            className="flex h-11 w-11 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="pt-5">
          <ThemeGallery
            mode={mode}
            colorTheme={colorTheme}
            onSelectMode={onSelectMode}
            onSelectColorTheme={onSelectColorTheme}
          />
        </div>
      </div>
    </div>
  );
};
