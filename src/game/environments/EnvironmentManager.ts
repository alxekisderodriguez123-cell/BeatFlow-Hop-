import * as THREE from 'three';
import type { EnvironmentTheme, QualityLevel, SongPalette } from '../../types/game';
import { CosmicDimensionWorld } from './CosmicDimensionWorld';
import { CyberpunkCityWorld } from './CyberpunkCityWorld';
import { DigitalDimensionWorld } from './DigitalDimensionWorld';
import { IndustrialReactorWorld } from './IndustrialReactorWorld';
import { MountainLandscapeWorld } from './MountainLandscapeWorld';
import { NewYorkNightWorld } from './NewYorkNightWorld';
import { NightclubWorld } from './NightclubWorld';
import { OceanWorld } from './OceanWorld';
import { SynthwaveHighwayWorld } from './SynthwaveHighwayWorld';
import { TropicalBeachWorld } from './TropicalBeachWorld';
import type { WorldAtmosphere, WorldInstance, WorldUpdateContext } from './types';

export function createWorldByTheme(
  theme: EnvironmentTheme,
  seed: string,
  maxAnisotropy: number,
  graphicsQuality: QualityLevel,
  palette: SongPalette,
): WorldInstance {
  const opts = { seed, maxAnisotropy, graphicsQuality, palette };
  switch (theme) {
    case 'tropical':
      return new TropicalBeachWorld(opts);
    case 'ocean':
      return new OceanWorld(opts);
    case 'mountain':
      return new MountainLandscapeWorld(opts);
    case 'newyork':
      return new NewYorkNightWorld(opts);
    case 'cosmic':
      return new CosmicDimensionWorld(opts);
    case 'nightclub':
      return new NightclubWorld(opts);
    case 'synthwave':
      return new SynthwaveHighwayWorld(opts);
    case 'reactor':
      return new IndustrialReactorWorld(opts);
    case 'digital':
      return new DigitalDimensionWorld(opts);
    case 'cyberpunk':
    default:
      return new CyberpunkCityWorld(opts);
  }
}

/**
 * Manages active 3D environment lifecycle so only ONE world resides in GPU memory at a time.
 * Smoothly loads on demand and completely disposes the outgoing world's geometries, textures, and materials.
 */
export class EnvironmentManager {
  private scene: THREE.Scene;
  private maxAnisotropy: number;
  private activeWorld: WorldInstance | null = null;
  private currentSeed = '';
  private currentQuality: QualityLevel = 'high';

  constructor(
    scene: THREE.Scene,
    maxAnisotropy: number,
    initialTheme: EnvironmentTheme,
    initialSeed: string,
    initialQuality: QualityLevel,
    initialPalette: SongPalette,
  ) {
    this.scene = scene;
    this.maxAnisotropy = maxAnisotropy;
    this.loadEnvironment(initialTheme, initialSeed, initialQuality, initialPalette, true);
  }

  public loadEnvironment(
    theme: EnvironmentTheme,
    seed: string,
    graphicsQuality: QualityLevel,
    palette: SongPalette,
    forceRebuild = false,
  ): WorldAtmosphere {
    if (
      !forceRebuild &&
      this.activeWorld &&
      this.activeWorld.theme === theme &&
      this.currentSeed === seed &&
      this.currentQuality === graphicsQuality
    ) {
      this.activeWorld.setPalette(palette);
      return this.activeWorld.atmosphere;
    }

    if (this.activeWorld) {
      this.scene.remove(this.activeWorld.group);
      this.activeWorld.dispose();
      this.activeWorld = null;
    }

    this.currentSeed = seed;
    this.currentQuality = graphicsQuality;
    const world = createWorldByTheme(theme, seed, this.maxAnisotropy, graphicsQuality, palette);
    this.activeWorld = world;
    this.scene.add(world.group);
    return world.atmosphere;
  }

  public getCurrentTheme(): EnvironmentTheme {
    return this.activeWorld?.theme ?? 'cyberpunk';
  }

  public getAtmosphere(): WorldAtmosphere | null {
    return this.activeWorld?.atmosphere ?? null;
  }

  public setPalette(palette: SongPalette): void {
    this.activeWorld?.setPalette(palette);
  }

  public update(ctx: WorldUpdateContext): void {
    this.activeWorld?.update(ctx);
  }

  public dispose(): void {
    if (this.activeWorld) {
      this.scene.remove(this.activeWorld.group);
      this.activeWorld.dispose();
      this.activeWorld = null;
    }
  }
}
