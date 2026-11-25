import React, {useEffect, useRef, useState} from 'react';
import {Check, Image as ImageIcon, Link2, RotateCcw, Upload, X} from 'lucide-react';
import type {MediaPickerTarget} from '../types/fhem';
import {
  BUILT_IN_VISUAL_PRESETS,
  compressImageFileToDataUrl,
  sanitizeImageUrl,
} from '../lib/roomVisuals';
import {SmartVisualImage} from './SmartVisualImage';

interface MediaPickerModalProps {
  target: MediaPickerTarget | null;
  currentSrc: string | null;
  hasCustomValue: boolean;
  onClose: () => void;
  onSave: (target: MediaPickerTarget, src: string | null) => void;
}

type PickerTab = 'upload' | 'gallery' | 'url';

export const MediaPickerModal: React.FC<MediaPickerModalProps> = ({
  target,
  currentSrc,
  hasCustomValue,
  onClose,
  onSave,
}) => {
  const [tab, setTab] = useState<PickerTab>('upload');
  const [previewSrc, setPreviewSrc] = useState<string | null>(currentSrc);
  const [urlInput, setUrlInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (target) {
      setPreviewSrc(currentSrc);
      setUrlInput(currentSrc && !currentSrc.startsWith('data:') && !currentSrc.startsWith('/assets') ? currentSrc : '');
      setErrorMsg(null);
      setTab('upload');
    }
  }, [target, currentSrc]);

  if (!target) return null;

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setErrorMsg(null);
    setProcessing(true);
    try {
      const maxDim = target.kind === 'floorplan' ? 1600 : target.kind === 'room' ? 1280 : 640;
      const compressed = await compressImageFileToDataUrl(file, maxDim, 0.84);
      setPreviewSrc(compressed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Bild konnte nicht verarbeitet werden.');
    } finally {
      setProcessing(false);
    }
  };

  const handleApplyUrl = () => {
    setErrorMsg(null);
    const clean = sanitizeImageUrl(urlInput);
    if (!clean) {
      setErrorMsg('Bitte gib eine gültige HTTPS-, HTTP- oder lokale FHEMWEB-Pfad-URL (z. B. /fhem/images/...) ein.');
      return;
    }
    setPreviewSrc(clean);
  };

  const titlePrefix =
    target.kind === 'room'
      ? `Raumbild: ${target.label}`
      : target.kind === 'device'
        ? `Gerätebild: ${target.label}`
        : 'Haus-Grundriss / Dashboard-Bild';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={titlePrefix}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl border theme-surface shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b theme-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-display text-base font-bold text-slate-900 dark:text-slate-100">
              {titlePrefix}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Eigenes Foto hochladen, Vorlage wählen oder FHEMWEB-Bild-URL angeben
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dialog schließen"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/[0.08]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Live Preview */}
        <div className="px-5 pt-4">
          <div className="relative h-40 w-full overflow-hidden rounded-2xl border theme-border">
            <SmartVisualImage
              src={previewSrc}
              alt={titlePrefix}
              label={target.label}
              className="h-full w-full"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2 text-white">
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-bold">{target.label}</div>
                <div className="text-[11px] text-white/80">
                  {previewSrc ? 'Vorschau des gewählten Bildes' : 'Architektur-Vektorgrafik (Standard)'}
                </div>
              </div>
              {processing && (
                <span className="text-[11px] font-semibold text-white/90">Wird optimiert…</span>
              )}
            </div>
          </div>
        </div>

        {/* Source Tabs */}
        <div className="px-5 pt-3.5">
          <div className="grid grid-cols-3 gap-1 rounded-2xl theme-surface-alt p-1">
            {(
              [
                {id: 'upload', label: 'Hochladen', icon: Upload},
                {id: 'gallery', label: 'Galerie', icon: ImageIcon},
                {id: 'url', label: 'Bild-URL', icon: Link2},
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    setErrorMsg(null);
                  }}
                  className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold transition-colors ${
                    tab === t.id
                      ? 'bg-[var(--m3-surface)] text-slate-900 shadow-xs dark:text-slate-100'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {errorMsg && (
            <div className="rounded-xl bg-red-500/12 px-3.5 py-2.5 text-xs font-medium text-red-700 dark:text-red-300">
              {errorMsg}
            </div>
          )}

          {tab === 'upload' && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                void handleFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors ${
                dragActive
                  ? 'border-[var(--accent-ring)] theme-tonal'
                  : 'theme-border hover:border-[var(--accent-ring)]'
              }`}
            >
              <Upload className="h-7 w-7 theme-text mb-2" />
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Eigenes Foto oder Grundriss auswählen
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                JPG, PNG, WebP oder GIF hierher ziehen oder vom Smartphone / PC wählen. Das Bild wird automatisch platzsparend optimiert und lokal im Gerät gespeichert.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  void handleFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                disabled={processing}
                onClick={() => fileInputRef.current?.click()}
                className="mt-4 min-h-[44px] rounded-xl theme-btn-primary px-5 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {processing ? 'Bild wird verarbeitet…' : 'Datei auswählen'}
              </button>
            </div>
          )}

          {tab === 'gallery' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {BUILT_IN_VISUAL_PRESETS.map((preset) => {
                const selected = previewSrc === preset.src;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => setPreviewSrc(preset.src)}
                    className={`group relative overflow-hidden rounded-2xl border text-left transition-all ${
                      selected
                        ? 'border-[var(--accent-ring)] ring-2 ring-[var(--accent-ring)]'
                        : 'theme-border hover:border-[var(--accent-ring)]'
                    }`}
                  >
                    <div className="aspect-[16/10] w-full overflow-hidden">
                      <img
                        src={preset.src}
                        alt={preset.label}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-1 text-white">
                      <span className="truncate text-xs font-semibold">{preset.label}</span>
                      {selected && (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {tab === 'url' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Bild-URL (HTTPS, HTTP oder lokaler FHEMWEB-Pfad)
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://... oder /fhem/images/default/..."
                    className="min-h-[44px] flex-1 rounded-xl border theme-border bg-white px-3.5 font-mono text-xs text-slate-900 focus:border-[var(--accent-ring)] focus:outline-none dark:bg-[var(--m3-canvas)] dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleApplyUrl}
                    className="min-h-[44px] rounded-xl theme-tonal px-4 text-xs font-semibold whitespace-nowrap"
                  >
                    Vorschau
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Tipp für FHEM: Du kannst Gerätebilder auch direkt als FHEM-Attribut hinterlegen, z. B.{' '}
                <code className="font-mono">attr MeinGeraet appOptions {`{"image":"https://..."}`}</code>.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t theme-border px-5 py-3.5">
          {hasCustomValue || (target.kind === 'floorplan' && previewSrc) ? (
            <button
              type="button"
              onClick={() => {
                onSave(target, null);
                onClose();
              }}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-red-600 hover:bg-red-500/10 dark:text-red-400"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {target.kind === 'room' ? 'Standard wiederherstellen' : 'Bild entfernen'}
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-xl theme-surface-alt px-4 text-xs font-semibold text-slate-700 hover:opacity-85 dark:text-slate-200"
            >
              Abbrechen
            </button>
            <button
              type="button"
              disabled={processing || !previewSrc}
              onClick={() => {
                if (previewSrc) {
                  onSave(target, previewSrc);
                  onClose();
                }
              }}
              className="flex min-h-[42px] items-center gap-1.5 rounded-xl theme-btn-primary px-5 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Bild übernehmen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
