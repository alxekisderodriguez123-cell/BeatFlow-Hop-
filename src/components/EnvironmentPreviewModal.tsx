import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Cpu, Eye, Globe, Sparkles, X } from 'lucide-react';
import type { EnvironmentPreference, EnvironmentTheme, QualityLevel } from '../types/game';
import {
  ALL_ENVIRONMENT_THEMES,
  ENVIRONMENT_OPTIONS,
  VANILLA_ENVIRONMENT_THEMES,
  getEnvironmentCategory,
  resolveSafeEnvironmentTheme,
} from '../game/environments/environmentSelector';
import {
  getEnvironmentDefinition,
  renderEnvironmentThumbnailDataUrl,
} from '../game/environments/environmentDefinitions';
import { EnvironmentPreview } from '../game/environments/EnvironmentPreview';

interface EnvironmentPreviewModalProps {
  currentMode: EnvironmentPreference;
  graphicsQuality?: QualityLevel;
  allowAutoAndRandom?: boolean;
  includeEditorThemes?: boolean;
  onSelect: (mode: EnvironmentPreference) => void;
  onClose: () => void;
}

export const EnvironmentPreviewModal: React.FC<EnvironmentPreviewModalProps> = ({
  currentMode,
  graphicsQuality = 'medium',
  allowAutoAndRandom = true,
  includeEditorThemes = false,
  onSelect,
  onClose,
}) => {
  const visibleThemes = includeEditorThemes ? ALL_ENVIRONMENT_THEMES : VANILLA_ENVIRONMENT_THEMES;
  const initialWorld =
    currentMode !== 'auto' && currentMode !== 'random'
      ? resolveSafeEnvironmentTheme(currentMode)
      : 'cyberpunk';

  const [selectedPref, setSelectedPref] = useState<EnvironmentPreference>(currentMode);
  const [previewWorld, setPreviewWorld] = useState(initialWorld);
  const [webglFailed, setWebglFailed] = useState(false);

  const previewMountRef = useRef<HTMLDivElement>(null);
  const previewEngineRef = useRef<EnvironmentPreview | null>(null);

  const thumbnails = useMemo(() => {
    const map = new Map<EnvironmentTheme, string>();
    for (const theme of visibleThemes) {
      map.set(theme, renderEnvironmentThumbnailDataUrl(theme));
    }
    return map;
  }, [visibleThemes]);

  const activeDef = getEnvironmentDefinition(previewWorld);

  useEffect(() => {
    const mount = previewMountRef.current;
    if (!mount) return;
    setWebglFailed(false);

    let engine: EnvironmentPreview | null = null;
    try {
      engine = new EnvironmentPreview(mount, previewWorld, graphicsQuality, () => {
        setWebglFailed(true);
      });
      previewEngineRef.current = engine;
    } catch {
      setWebglFailed(true);
    }

    const onResize = () => engine?.resize();
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      engine?.dispose();
      previewEngineRef.current = null;
    };
    // Mount once for the modal lifetime; theme changes switch in-place without recreating canvas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    previewEngineRef.current?.loadTheme(previewWorld, graphicsQuality);
  }, [previewWorld, graphicsQuality]);

  const handleChooseOption = (pref: EnvironmentPreference) => {
    setSelectedPref(pref);
    if (pref !== 'auto' && pref !== 'random') {
      setPreviewWorld(resolveSafeEnvironmentTheme(pref));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/82 p-3 sm:p-5">
      <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-[#070b1e] border border-cyan-400/35 shadow-[0_0_48px_rgba(34,211,238,0.22)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Globe className="w-5 h-5 text-cyan-300 shrink-0" />
            <div className="min-w-0">
              <h2 className="font-display font-bold text-base sm:text-lg text-white truncate">
                Selector Visual de Escenarios
              </h2>
              <p className="text-xs text-slate-400 truncate">
                {visibleThemes.length} escenarios 2.5D con vista previa en vivo
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            aria-label="Cerrar selector de escenarios"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main 2-column Studio Body */}
        <div className="flex-1 overflow-y-auto beatflow-scroll p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left: Live 2.5D Environment Preview + Specs */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#040714] border border-cyan-500/30">
              <div ref={previewMountRef} className="w-full h-full" />
              {webglFailed && (
                <img
                  src={thumbnails.get(previewWorld)}
                  alt={activeDef.displayName}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/85 via-black/40 to-transparent">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-bold text-sm text-white">
                    {activeDef.displayName}
                  </span>
                  <span className="text-[11px] font-mono-num text-cyan-200 tabular-nums">
                    FOV {activeDef.cameraSettings.baseFov}°
                  </span>
                </div>
              </div>
            </div>

            {/* Scenario metadata (clean unboxed typographic metadata, zero pill clutter) */}
            <div className="rounded-xl bg-slate-900/75 border border-slate-800 p-4 space-y-3">
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                {activeDef.description}
              </p>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                <span className="inline-flex items-center gap-1 text-slate-200 font-medium">
                  <Cpu className="w-3.5 h-3.5 text-cyan-300" />
                  Costo GPU: {activeDef.qualitySettings.gpuCostLabel}
                </span>
                <span aria-hidden="true">·</span>
                <span>{getEnvironmentCategory(previewWorld) === 'editor' ? 'Editor' : 'Vanilla'}</span>
                <span aria-hidden="true">·</span>
                <span>Calidad rec.: {activeDef.qualitySettings.recommendedQuality.toUpperCase()}</span>
                <span aria-hidden="true">·</span>
                <span>Partículas: {activeDef.particleProfile.kind}</span>
              </div>

              <div className="text-xs text-slate-300 border-t border-slate-800/80 pt-2.5 flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-fuchsia-300 shrink-0 mt-0.5" />
                <span>{activeDef.ambientEffectsSummary}</span>
              </div>

              {/* Palette Swatches */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                <span className="text-xs text-slate-400">Paleta cromática</span>
                <div className="flex items-center gap-1.5">
                  {[
                    activeDef.colorPalette.primary,
                    activeDef.colorPalette.secondary,
                    activeDef.colorPalette.tertiary,
                    activeDef.colorPalette.accent,
                    activeDef.colorPalette.complementary,
                  ].map((hex, idx) => (
                    <span
                      key={`${hex}-${idx}`}
                      title={hex}
                      className="w-5 h-5 rounded-md border border-white/20"
                      style={{ backgroundColor: hex }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Grid of 4 Illustrated Worlds + Auto/Random */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            {allowAutoAndRandom && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {ENVIRONMENT_OPTIONS.filter((o) => o.id === 'auto' || o.id === 'random').map((opt) => {
                  const active = selectedPref === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleChooseOption(opt.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-cyan-500/18 border-cyan-300 text-white'
                          : 'bg-slate-900/75 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{opt.label}</span>
                        {active && <Check className="w-4 h-4 text-cyan-300 shrink-0" />}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 line-clamp-2">{opt.subtitle}</p>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {visibleThemes.map((theme) => {
                const def = getEnvironmentDefinition(theme);
                const isSelected = selectedPref === theme;
                const isPreviewing = previewWorld === theme;
                const thumb = thumbnails.get(theme);
                return (
                  <div
                    key={theme}
                    onClick={() => handleChooseOption(theme)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleChooseOption(theme);
                      }
                    }}
                    className={`group rounded-xl border overflow-hidden text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-950/45 border-cyan-300'
                        : isPreviewing
                          ? 'bg-slate-900 border-indigo-400/70'
                          : 'bg-slate-900/75 border-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="relative h-24 w-full bg-slate-950 overflow-hidden">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={def.displayName}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                        />
                      ) : null}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                      <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2">
                        <span className="font-display font-bold text-xs sm:text-sm text-white truncate">
                          {def.displayName}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-white/30"
                            style={{ backgroundColor: def.colorPalette.primary }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-white/30"
                            style={{ backgroundColor: def.colorPalette.secondary }}
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-white/30"
                            style={{ backgroundColor: def.colorPalette.accent }}
                          />
                        </span>
                      </div>
                    </div>
                    <div className="px-3 py-2 flex items-center justify-between gap-2 text-[11px] text-slate-400">
                      <span className="truncate">
                        {def.category === 'editor' ? 'Editor' : 'Vanilla'} · {def.qualitySettings.gpuCostLabel}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewWorld(theme);
                        }}
                        className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span>{isPreviewing ? 'Viendo' : 'Vista 2.5D'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/90 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-300 truncate">
            Selección actual:{' '}
            <span className="font-semibold text-cyan-300">
              {selectedPref === 'auto'
                ? 'Automático según música'
                : selectedPref === 'random'
                  ? 'Aleatorio por partida'
                  : getEnvironmentDefinition(selectedPref).displayName}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] px-4 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs sm:text-sm font-semibold hover:bg-slate-800 cursor-pointer whitespace-nowrap"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                onSelect(selectedPref);
                onClose();
              }}
              className="min-h-[40px] px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-600 text-white text-xs sm:text-sm font-bold hover:brightness-110 cursor-pointer whitespace-nowrap"
            >
              Confirmar Escenario
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
