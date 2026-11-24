import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { EnvironmentTheme, QualityLevel } from '../types/game';
import type { BeatflowLevelDocument, CreatorObject } from '../types/creator';
import { createWorldByTheme } from './../game/environments/EnvironmentManager';
import type { WorldInstance } from './../game/environments/types';
import { GroupManager } from './GroupManager';
import { ObjectRuntimeState } from './AnimationController';
import type { EditorToolMode } from './CreatorEditor';
import type { LevelPlaytest } from './LevelPlaytest';

export interface CreatorCanvasCallbacks {
  onSelectIds?: (ids: string[], additive: boolean) => void;
  onPlaceAt?: (timeSec: number, lane: number, worldPos: { x: number; y: number; z: number }) => void;
  onMoveSelectedDelta?: (dx: number, dy: number, dTimeSec: number) => void;
  onContextLossChange?: (lost: boolean) => void;
}

export interface CanvasPerfMetrics {
  fps: number;
  drawCalls: number;
  visibleObjects: number;
  instancedDecorCount: number;
}

const TRACK_SPEED = 11.5; // units per second along Z

function buildGeometryForObject(obj: CreatorObject): THREE.BufferGeometry {
  const shape = obj.material.shape;
  switch (obj.type) {
    case 'note_hold':
      return new THREE.BoxGeometry(1.05, 0.22, Math.max(1.2, (obj.noteData?.durationSec ?? 1) * TRACK_SPEED * 0.45));
    case 'obstacle':
      return new THREE.ConeGeometry(0.55, 1.15, 4);
    case 'speed_portal':
    case 'transition_gate':
    case 'geom_ring':
    case 'hit_zone':
      return new THREE.TorusGeometry(0.65, 0.14, 10, 24);
    case 'geom_triangle':
      return new THREE.ConeGeometry(0.65, 1.1, 4);
    case 'geom_cylinder':
    case 'light_beacon':
      return new THREE.CylinderGeometry(0.45, 0.45, 1, 14);
    case 'geom_sphere':
    case 'interactive_orb':
    case 'particle_emitter':
    case 'light_source':
    case 'luminous_orb':
    case 'reference_point':
      return new THREE.SphereGeometry(0.5, 14, 12);
    case 'geom_diamond':
    case 'note_flick':
    case 'marker_node':
      return new THREE.OctahedronGeometry(0.55, 0);
    case 'trigger_node':
    case 'group_anchor':
    case 'event_node':
    case 'note_slide':
      return new THREE.CylinderGeometry(0.52, 0.52, 0.34, 6);
    default:
      if (shape === 'sphere') return new THREE.SphereGeometry(0.5, 14, 12);
      if (shape === 'diamond') return new THREE.OctahedronGeometry(0.52, 0);
      if (shape === 'ring') return new THREE.TorusGeometry(0.55, 0.12, 8, 20);
      if (shape === 'prism') return new THREE.ConeGeometry(0.55, 1, 4);
      if (shape === 'hexagon') return new THREE.CylinderGeometry(0.55, 0.55, 0.3, 6);
      if (shape === 'disc') return new THREE.CylinderGeometry(0.55, 0.55, 0.2, 18);
      return new THREE.BoxGeometry(1.08, 0.28, 0.72);
  }
}

export class CreatorCanvas {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private worldGroup = new THREE.Group();
  private gridGroup = new THREE.Group();
  private objectsGroup = new THREE.Group();
  private gizmoGroup = new THREE.Group();
  private pmremGenerator: THREE.PMREMGenerator;
  private envRenderTarget: THREE.WebGLRenderTarget;

  private activeWorld: WorldInstance | null = null;
  private currentTheme: EnvironmentTheme = 'cyberpunk';
  private floorMesh: THREE.Mesh;
  private laneLinesGroup = new THREE.Group();
  private receptorLineMesh: THREE.Mesh;

  // Pooled object entries
  private meshMap = new Map<
    string,
    {
      mesh: THREE.Mesh;
      mat: THREE.MeshStandardMaterial;
      wire: THREE.LineSegments;
      typeSig: string;
    }
  >();

  // InstancedMesh pool for repeated static decorations (>20 cubes/spheres)
  private instancedCubeMesh: THREE.InstancedMesh;
  private instancedCubeMat: THREE.MeshStandardMaterial;

  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  private level: BeatflowLevelDocument;
  private selectedIds = new Set<string>();
  private activeTool: EditorToolMode = 'select';
  private cursorTime = 0;
  private callbacks: CreatorCanvasCallbacks;
  private playtest: LevelPlaytest | null = null;

  // Editor orbit/pan camera controls
  private camYaw = 0;
  private camPitch = 0.42;
  private camDistance = 12.5;
  private camPanX = 0;
  private camPanY = 0.5;
  private zoomTimeOffset = 0;

  // Pointer interaction state
  private pointerDown = false;
  private pointerMode: 'none' | 'orbit' | 'drag_obj' | 'box_select' = 'none';
  private startClientX = 0;
  private startClientY = 0;
  private lastDragWorld = new THREE.Vector3();
  private boxOverlay: HTMLDivElement;

  private rafId = 0;
  private disposed = false;
  private contextLost = false;
  private lastFrameTs = performance.now();
  private fpsAccum = 0;
  private fpsFrames = 0;
  private perfMetrics: CanvasPerfMetrics = {
    fps: 60,
    drawCalls: 0,
    visibleObjects: 0,
    instancedDecorCount: 0,
  };
  private tmpRuntimeState: ObjectRuntimeState = {
    offsetX: 0,
    offsetY: 0,
    offsetZ: 0,
    rotOffsetX: 0,
    rotOffsetY: 0,
    rotOffsetZ: 0,
    scaleMultX: 1,
    scaleMultY: 1,
    scaleMultZ: 1,
    color: '#22d3ee',
    opacity: 1,
    emission: 1,
    glowIntensity: 1,
    blendMode: 'normal',
    visible: true,
    collisionEnabled: true,
  };
  private dummyMatrix = new THREE.Object3D();
  private tmpColor = new THREE.Color();

  constructor(
    container: HTMLElement,
    initialLevel: BeatflowLevelDocument,
    callbacks: CreatorCanvasCallbacks = {},
  ) {
    this.container = container;
    this.level = initialLevel;
    this.callbacks = callbacks;

    const w = Math.max(300, container.clientWidth);
    const h = Math.max(240, container.clientHeight);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050819');
    this.scene.fog = new THREE.FogExp2('#070b22', 0.015);

    this.camera = new THREE.PerspectiveCamera(56, w / h, 0.1, 160);

    this.pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = this.pmremGenerator.fromScene(roomEnv, 0.04);
    this.scene.environment = this.envRenderTarget.texture;
    roomEnv.dispose();

    const hemi = new THREE.HemisphereLight('#c4d9ff', '#090b1a', 0.85);
    const dir = new THREE.DirectionalLight('#ffffff', 1.15);
    dir.position.set(6, 12, 8);
    this.scene.add(hemi, dir);

    this.scene.add(this.worldGroup);
    this.scene.add(this.gridGroup);
    this.scene.add(this.objectsGroup);
    this.scene.add(this.gizmoGroup);

    // Highway floor
    const floorGeo = new THREE.PlaneGeometry(7.2, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: '#0b1028',
      roughness: 0.42,
      metalness: 0.35,
    });
    this.floorMesh = new THREE.Mesh(floorGeo, floorMat);
    this.floorMesh.position.set(0, -0.02, -22);
    this.gridGroup.add(this.floorMesh);

    const receptorGeo = new THREE.BoxGeometry(6.8, 0.07, 0.22);
    const receptorMat = new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.85,
    });
    this.receptorLineMesh = new THREE.Mesh(receptorGeo, receptorMat);
    this.receptorLineMesh.position.set(0, 0.03, 0);
    this.gridGroup.add(this.receptorLineMesh);
    this.gridGroup.add(this.laneLinesGroup);

    // Instanced pool for static repeated decoration boxes
    const instGeo = new THREE.BoxGeometry(1, 1, 1);
    this.instancedCubeMat = new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#1e293b',
      emissiveIntensity: 0.55,
      roughness: 0.28,
      metalness: 0.45,
    });
    this.instancedCubeMesh = new THREE.InstancedMesh(instGeo, this.instancedCubeMat, 256);
    this.instancedCubeMesh.count = 0;
    this.instancedCubeMesh.frustumCulled = false;
    this.objectsGroup.add(this.instancedCubeMesh);

    this.rebuildLaneLines();
    this.setEnvironment(initialLevel.environmentTheme);

    // Marquee selection overlay inside container
    this.boxOverlay = document.createElement('div');
    this.boxOverlay.style.position = 'absolute';
    this.boxOverlay.style.border = '1.5px solid #22d3ee';
    this.boxOverlay.style.background = 'rgba(34, 211, 238, 0.14)';
    this.boxOverlay.style.pointerEvents = 'none';
    this.boxOverlay.style.display = 'none';
    this.boxOverlay.style.zIndex = '20';
    this.container.appendChild(this.boxOverlay);

    this.bindEvents();
    this.animate();
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    dom.addEventListener('wheel', this.onWheel, { passive: false });
    dom.addEventListener('webglcontextlost', this.onContextLost);
    dom.addEventListener('webglcontextrestored', this.onContextRestored);
    window.addEventListener('resize', this.onResize);
  }

  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    this.callbacks.onContextLossChange?.(true);
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.callbacks.onContextLossChange?.(false);
  };

  public onResize = (): void => {
    if (this.disposed) return;
    const w = Math.max(300, this.container.clientWidth);
    const h = Math.max(240, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  public setEnvironment(theme: EnvironmentTheme): void {
    if (this.currentTheme === theme && this.activeWorld) return;
    this.currentTheme = theme;
    if (this.activeWorld) {
      this.worldGroup.remove(this.activeWorld.group);
      this.activeWorld.dispose();
      this.activeWorld = null;
    }
    this.activeWorld = createWorldByTheme(
      theme,
      `creator-${theme}`,
      this.renderer.capabilities.getMaxAnisotropy(),
      'medium',
      this.level.audio.palette,
    );
    this.worldGroup.add(this.activeWorld.group);
  }

  private rebuildLaneLines(): void {
    while (this.laneLinesGroup.children.length > 0) {
      const child = this.laneLinesGroup.children[0] as THREE.Mesh;
      this.laneLinesGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }
    const lanes = this.level.gameplayRules.laneCount;
    const spacing = 1.45;
    const totalW = lanes * spacing;
    (this.floorMesh.geometry as THREE.PlaneGeometry).dispose();
    const nextFloorGeo = new THREE.PlaneGeometry(totalW + 1.2, 72);
    nextFloorGeo.rotateX(-Math.PI / 2);
    this.floorMesh.geometry = nextFloorGeo;

    for (let i = 0; i <= lanes; i++) {
      const x = (i - lanes / 2) * spacing;
      const geo = new THREE.BoxGeometry(0.045, 0.025, 72);
      const mat = new THREE.MeshBasicMaterial({
        color: i === 0 || i === lanes ? '#38bdf8' : '#334155',
        transparent: true,
        opacity: i === 0 || i === lanes ? 0.8 : 0.45,
      });
      const line = new THREE.Mesh(geo, mat);
      line.position.set(x, 0.01, -24);
      this.laneLinesGroup.add(line);
    }

    // Beat grid crossbars
    const beatDur = 60 / Math.max(40, this.level.audio.bpm);
    const beatStepZ = beatDur * TRACK_SPEED;
    for (let b = 0; b < 32; b++) {
      const z = -b * beatStepZ;
      if (z < -56) break;
      const isBar = b % 4 === 0;
      const geo = new THREE.BoxGeometry(totalW + 0.4, 0.018, isBar ? 0.08 : 0.03);
      const mat = new THREE.MeshBasicMaterial({
        color: isBar ? '#22d3ee' : '#64748b',
        transparent: true,
        opacity: isBar ? 0.55 : 0.28,
      });
      const barLine = new THREE.Mesh(geo, mat);
      barLine.position.set(0, 0.012, z);
      this.laneLinesGroup.add(barLine);
    }
  }

  public syncState(
    level: BeatflowLevelDocument,
    selectedIds: string[],
    activeTool: EditorToolMode,
    cursorTime: number,
    playtest: LevelPlaytest | null,
  ): void {
    const laneOrBpmChanged =
      level.gameplayRules.laneCount !== this.level.gameplayRules.laneCount ||
      level.audio.bpm !== this.level.audio.bpm;
    const envChanged = level.environmentTheme !== this.currentTheme;

    this.level = level;
    this.selectedIds = new Set(selectedIds);
    this.activeTool = activeTool;
    this.cursorTime = cursorTime;
    this.playtest = playtest;

    if (laneOrBpmChanged) this.rebuildLaneLines();
    if (envChanged) this.setEnvironment(level.environmentTheme);
  }

  public getPerfMetrics(): CanvasPerfMetrics {
    return { ...this.perfMetrics };
  }

  public resetCameraView(): void {
    this.camYaw = 0;
    this.camPitch = 0.42;
    this.camDistance = 12.5;
    this.camPanX = 0;
    this.camPanY = 0.5;
    this.zoomTimeOffset = 0;
  }

  private getNDC(clientX: number, clientY: number): THREE.Vector2 {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  private intersectGround(clientX: number, clientY: number): THREE.Vector3 | null {
    const ndc = this.getNDC(clientX, clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, out);
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (this.playtest?.isRunning()) return;
    this.pointerDown = true;
    this.startClientX = e.clientX;
    this.startClientY = e.clientY;

    if (e.button === 2 || e.altKey) {
      this.pointerMode = 'orbit';
      return;
    }

    if (this.activeTool === 'box_select') {
      this.pointerMode = 'box_select';
      this.updateBoxOverlay(e.clientX, e.clientY);
      return;
    }

    const ndc = this.getNDC(e.clientX, e.clientY);
    this.raycaster.setFromCamera(ndc, this.camera);
    const selectableMeshes: THREE.Object3D[] = [];
    for (const entry of this.meshMap.values()) {
      if (entry.mesh.visible) selectableMeshes.push(entry.mesh);
    }

    const hits = this.raycaster.intersectObjects(selectableMeshes, false);
    if (hits.length > 0) {
      const hitId = hits[0].object.userData.objectId as string | undefined;
      if (hitId) {
        if (!this.selectedIds.has(hitId) || e.shiftKey) {
          this.callbacks.onSelectIds?.([hitId], e.shiftKey);
        }
        if (this.activeTool === 'move' || this.activeTool === 'select') {
          const hitPt = this.intersectGround(e.clientX, e.clientY);
          if (hitPt) this.lastDragWorld.copy(hitPt);
          this.pointerMode = 'drag_obj';
          return;
        }
      }
    }

    if (this.activeTool === 'place') {
      const pt = this.intersectGround(e.clientX, e.clientY);
      if (pt) {
        const lanes = this.level.gameplayRules.laneCount;
        const laneF = pt.x / 1.45 + (lanes - 1) / 2;
        const lane = Math.max(0, Math.min(lanes - 1, Math.round(laneF)));
        const tSec = Math.max(0, this.cursorTime - pt.z / TRACK_SPEED);
        this.callbacks.onPlaceAt?.(tSec, lane, {
          x: Number(pt.x.toFixed(2)),
          y: 0.14,
          z: 0,
        });
      }
      this.pointerMode = 'none';
      return;
    }

    // Clicked empty ground -> orbit or deselect on clean click
    this.pointerMode = 'orbit';
  };

  private updateBoxOverlay(curX: number, curY: number): void {
    const rect = this.container.getBoundingClientRect();
    const x1 = Math.min(this.startClientX, curX) - rect.left;
    const y1 = Math.min(this.startClientY, curY) - rect.top;
    const w = Math.abs(curX - this.startClientX);
    const h = Math.abs(curY - this.startClientY);
    this.boxOverlay.style.display = 'block';
    this.boxOverlay.style.left = `${x1}px`;
    this.boxOverlay.style.top = `${y1}px`;
    this.boxOverlay.style.width = `${w}px`;
    this.boxOverlay.style.height = `${h}px`;
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointerDown || this.playtest?.isRunning()) return;
    const dxPx = e.clientX - this.startClientX;
    const dyPx = e.clientY - this.startClientY;

    if (this.pointerMode === 'box_select') {
      this.updateBoxOverlay(e.clientX, e.clientY);
      return;
    }

    if (this.pointerMode === 'drag_obj' && this.selectedIds.size > 0) {
      const pt = this.intersectGround(e.clientX, e.clientY);
      if (pt) {
        const dx = pt.x - this.lastDragWorld.x;
        const dz = pt.z - this.lastDragWorld.z;
        if (Math.abs(dx) > 0.03 || Math.abs(dz) > 0.03) {
          this.lastDragWorld.copy(pt);
          const dTime = -dz / TRACK_SPEED;
          this.callbacks.onMoveSelectedDelta?.(dx, 0, dTime);
        }
      }
      return;
    }

    if (this.pointerMode === 'orbit') {
      this.camYaw -= (e.movementX || dxPx * 0.05) * 0.0055;
      this.camPitch = Math.max(0.12, Math.min(1.32, this.camPitch + (e.movementY || dyPx * 0.05) * 0.0045));
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointerDown) return;
    this.pointerDown = false;

    if (this.pointerMode === 'box_select') {
      this.boxOverlay.style.display = 'none';
      const rect = this.renderer.domElement.getBoundingClientRect();
      const minX = Math.min(this.startClientX, e.clientX);
      const maxX = Math.max(this.startClientX, e.clientX);
      const minY = Math.min(this.startClientY, e.clientY);
      const maxY = Math.max(this.startClientY, e.clientY);

      const hits: string[] = [];
      const proj = new THREE.Vector3();
      for (const [id, entry] of this.meshMap.entries()) {
        if (!entry.mesh.visible) continue;
        proj.copy(entry.mesh.position).project(this.camera);
        if (proj.z > 1 || proj.z < -1) continue;
        const sx = rect.left + ((proj.x + 1) * 0.5) * rect.width;
        const sy = rect.top + ((-proj.y + 1) * 0.5) * rect.height;
        if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
          hits.push(id);
        }
      }
      this.callbacks.onSelectIds?.(hits, e.shiftKey);
    } else if (
      this.pointerMode === 'orbit' &&
      Math.hypot(e.clientX - this.startClientX, e.clientY - this.startClientY) < 5
    ) {
      // Clean tap on empty space clears selection unless shift held
      if (!e.shiftKey) this.callbacks.onSelectIds?.([], false);
    }

    this.pointerMode = 'none';
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.camDistance = Math.max(5.5, Math.min(28, this.camDistance + e.deltaY * 0.01));
  };

  private getOrCreateEntry(obj: CreatorObject) {
    const existing = this.meshMap.get(obj.id);
    const sig = `${obj.type}:${obj.material.shape}:${obj.noteData?.durationSec ?? 0}`;
    if (existing && existing.typeSig === sig) return existing;

    if (existing) {
      this.objectsGroup.remove(existing.mesh);
      existing.mesh.geometry.dispose();
      existing.mat.dispose();
      existing.wire.geometry.dispose();
      (existing.wire.material as THREE.Material).dispose();
    }

    const geo = buildGeometryForObject(obj);
    const mat = new THREE.MeshStandardMaterial({
      color: obj.material.color,
      emissive: obj.material.emissive || obj.material.color,
      emissiveIntensity: obj.material.emission,
      roughness: 0.25,
      metalness: 0.45,
      transparent: true,
      opacity: obj.material.opacity,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.objectId = obj.id;

    const edgesGeo = new THREE.EdgesGeometry(geo);
    const edgesMat = new THREE.LineBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.75,
    });
    const wire = new THREE.LineSegments(edgesGeo, edgesMat);
    wire.visible = false;
    mesh.add(wire);

    this.objectsGroup.add(mesh);
    const entry = { mesh, mat, wire, typeSig: sig };
    this.meshMap.set(obj.id, entry);
    return entry;
  }

  private animate = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);
    if (this.contextLost) return;

    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrameTs) / 1000);
    this.lastFrameTs = now;

    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.perfMetrics.fps = Math.round(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const isPlaytesting = Boolean(this.playtest?.isRunning());
    if (this.playtest && isPlaytesting) {
      this.playtest.step(dt);
    }

    const displayTime = isPlaytesting && this.playtest ? this.playtest.getCurrentTime() : this.cursorTime;
    const speedMult =
      isPlaytesting && this.playtest
        ? this.playtest.getGameplayRuntime().getSpeedMultiplier()
        : 1.0;

    // Update World background animation
    if (this.activeWorld) {
      const snap = isPlaytesting && this.playtest ? this.playtest.getInspectionSnapshot() : null;
      this.activeWorld.update({
        elapsed: now * 0.001,
        dt,
        mode: isPlaytesting ? 'playing' : 'idle',
        bass: snap ? snap.lighting.bassLevel : 0.25,
        mid: 0.28,
        high: 0.22,
        energy: 0.35,
        beatPulse: snap ? snap.lighting.kickPulse : 0.1,
        kickPulse: snap ? snap.lighting.kickPulse : 0.1,
        snarePulse: snap ? snap.lighting.snarePulse : 0.05,
        hihatPulse: snap ? snap.lighting.hihatPulse : 0.05,
        dropFlash: snap ? snap.lighting.dropFlash : 0,
        inSilence: false,
        reactiveEnabled: true,
        graphicsQuality: 'medium' as QualityLevel,
        reflectionQuality: 'medium' as QualityLevel,
        visualIntensity: 'medium',
        particleIntensity: 'medium',
        brightness: 0.95,
      });
    }

    // Update Camera
    if (isPlaytesting && this.playtest) {
      const snap = this.playtest.getInspectionSnapshot();
      const camSt = snap.cameraState;
      this.camera.fov = camSt.fov;
      this.camera.updateProjectionMatrix();
      const shakeX = camSt.shake > 0.01 ? (Math.random() - 0.5) * camSt.shake * 0.45 : 0;
      const shakeY = camSt.shake > 0.01 ? (Math.random() - 0.5) * camSt.shake * 0.45 : 0;
      this.camera.position.set(
        camSt.offsetX + shakeX,
        this.level.camera.baseHeight + camSt.offsetY + shakeY,
        this.level.camera.baseDistance + camSt.offsetZ,
      );
      this.camera.lookAt(camSt.offsetX * 0.35, 0.35, -7);
      this.camera.rotation.z += THREE.MathUtils.degToRad(camSt.rollDeg);
      this.renderer.toneMappingExposure = Math.max(
        0.55,
        Math.min(1.45, snap.lighting.effectiveExposure + snap.effectsState.exposureDelta),
      );
    } else {
      this.camera.fov = this.level.camera.baseFov;
      this.camera.updateProjectionMatrix();
      const cx = this.camPanX + Math.sin(this.camYaw) * Math.cos(this.camPitch) * this.camDistance;
      const cy = this.camPanY + Math.sin(this.camPitch) * this.camDistance;
      const cz = -4 + this.zoomTimeOffset + Math.cos(this.camYaw) * Math.cos(this.camPitch) * this.camDistance;
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(this.camPanX, this.camPanY, -6 + this.zoomTimeOffset);
      this.renderer.toneMappingExposure = 0.95;
    }

    // Sync objects & use InstancedMesh batching for repeated static cubes when unselected
    const activeIds = new Set<string>();
    const staticInstancedCandidates: CreatorObject[] = [];
    for (const obj of this.level.objects) {
      activeIds.add(obj.id);
      if (
        !isPlaytesting &&
        obj.type === 'geom_box' &&
        !this.selectedIds.has(obj.id) &&
        GroupManager.isObjectVisible(obj, this.level.groups) &&
        Math.abs(obj.timeSec - displayTime) <= 18
      ) {
        staticInstancedCandidates.push(obj);
      }
    }

    const useInstancingForCubes = staticInstancedCandidates.length > 20;
    let instIdx = 0;

    // Prune deleted object meshes
    for (const [id, entry] of this.meshMap.entries()) {
      if (!activeIds.has(id)) {
        this.objectsGroup.remove(entry.mesh);
        entry.mesh.geometry.dispose();
        entry.mat.dispose();
        entry.wire.geometry.dispose();
        (entry.wire.material as THREE.Material).dispose();
        this.meshMap.delete(id);
      }
    }

    let visibleCount = 0;
    const noteStates =
      isPlaytesting && this.playtest
        ? new Map(
            this.playtest
              .getGameplayRuntime()
              .getNoteStates()
              .map((ns) => [ns.objectId, ns]),
          )
        : null;

    for (let i = 0; i < this.level.objects.length; i++) {
      const obj = this.level.objects[i];
      const dtToCursor = obj.timeSec - displayTime;
      const zWorld = -dtToCursor * TRACK_SPEED * speedMult + obj.position.z;

      // Frustum/time culling window
      const inRange = zWorld <= 12 && zWorld >= -85;
      const noteState = noteStates?.get(obj.id);

      if (
        useInstancingForCubes &&
        obj.type === 'geom_box' &&
        !this.selectedIds.has(obj.id) &&
        inRange &&
        instIdx < 256
      ) {
        const entry = this.meshMap.get(obj.id);
        if (entry) entry.mesh.visible = false;
        this.dummyMatrix.position.set(obj.position.x, obj.position.y, zWorld);
        this.dummyMatrix.rotation.set(
          THREE.MathUtils.degToRad(obj.rotation.x),
          THREE.MathUtils.degToRad(obj.rotation.y),
          THREE.MathUtils.degToRad(obj.rotation.z),
        );
        this.dummyMatrix.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
        this.dummyMatrix.updateMatrix();
        this.instancedCubeMesh.setMatrixAt(instIdx, this.dummyMatrix.matrix);
        this.tmpColor.set(obj.material.color);
        this.instancedCubeMesh.setColorAt(instIdx, this.tmpColor);
        instIdx++;
        visibleCount++;
        continue;
      }

      const entry = this.getOrCreateEntry(obj);
      let vis = inRange && GroupManager.isObjectVisible(obj, this.level.groups);

      if (noteState?.resolved && obj.category === 'gameplay') {
        vis = false;
      }

      if (this.playtest) {
        this.playtest.resolveObjectRuntime(i, this.tmpRuntimeState);
        if (!this.tmpRuntimeState.visible) vis = false;
        entry.mesh.position.set(
          obj.position.x + this.tmpRuntimeState.offsetX,
          obj.position.y + this.tmpRuntimeState.offsetY,
          zWorld + this.tmpRuntimeState.offsetZ,
        );
        entry.mesh.rotation.set(
          THREE.MathUtils.degToRad(obj.rotation.x + this.tmpRuntimeState.rotOffsetX),
          THREE.MathUtils.degToRad(obj.rotation.y + this.tmpRuntimeState.rotOffsetY),
          THREE.MathUtils.degToRad(obj.rotation.z + this.tmpRuntimeState.rotOffsetZ),
        );
        entry.mesh.scale.set(
          obj.scale.x * this.tmpRuntimeState.scaleMultX,
          obj.scale.y * this.tmpRuntimeState.scaleMultY,
          obj.scale.z * this.tmpRuntimeState.scaleMultZ,
        );
        entry.mat.color.set(this.tmpRuntimeState.color);
        entry.mat.emissive.set(this.tmpRuntimeState.color);
        entry.mat.opacity = this.tmpRuntimeState.opacity;
        entry.mat.emissiveIntensity = this.tmpRuntimeState.emission * 0.72;
        entry.mat.blending =
          this.tmpRuntimeState.blendMode === 'additive'
            ? THREE.AdditiveBlending
            : this.tmpRuntimeState.blendMode === 'multiply'
              ? THREE.MultiplyBlending
              : THREE.NormalBlending;
      } else {
        entry.mesh.position.set(obj.position.x, obj.position.y, zWorld);
        entry.mesh.rotation.set(
          THREE.MathUtils.degToRad(obj.rotation.x),
          THREE.MathUtils.degToRad(obj.rotation.y),
          THREE.MathUtils.degToRad(obj.rotation.z),
        );
        entry.mesh.scale.set(obj.scale.x, obj.scale.y, obj.scale.z);
        entry.mat.color.set(obj.material.color);
        entry.mat.emissive.set(obj.material.emissive || obj.material.color);
        entry.mat.opacity = obj.material.opacity;
        entry.mat.emissiveIntensity = obj.material.emission * 0.72;
      }

      entry.mesh.visible = vis;
      entry.wire.visible = !isPlaytesting && this.selectedIds.has(obj.id);
      if (vis) visibleCount++;
    }

    this.instancedCubeMesh.count = instIdx;
    if (instIdx > 0) {
      this.instancedCubeMesh.instanceMatrix.needsUpdate = true;
      if (this.instancedCubeMesh.instanceColor) {
        this.instancedCubeMesh.instanceColor.needsUpdate = true;
      }
    }

    this.renderer.render(this.scene, this.camera);
    this.perfMetrics.drawCalls = this.renderer.info.render.calls;
    this.perfMetrics.visibleObjects = visibleCount;
    this.perfMetrics.instancedDecorCount = instIdx;
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    dom.removeEventListener('wheel', this.onWheel);
    dom.removeEventListener('webglcontextlost', this.onContextLost);
    dom.removeEventListener('webglcontextrestored', this.onContextRestored);
    window.removeEventListener('resize', this.onResize);

    if (this.activeWorld) {
      this.worldGroup.remove(this.activeWorld.group);
      this.activeWorld.dispose();
      this.activeWorld = null;
    }

    for (const entry of this.meshMap.values()) {
      entry.mesh.geometry.dispose();
      entry.mat.dispose();
      entry.wire.geometry.dispose();
      (entry.wire.material as THREE.Material).dispose();
    }
    this.meshMap.clear();

    this.instancedCubeMesh.geometry.dispose();
    this.instancedCubeMat.dispose();
    this.floorMesh.geometry.dispose();
    (this.floorMesh.material as THREE.Material).dispose();
    this.receptorLineMesh.geometry.dispose();
    (this.receptorLineMesh.material as THREE.Material).dispose();

    while (this.laneLinesGroup.children.length > 0) {
      const child = this.laneLinesGroup.children[0] as THREE.Mesh;
      this.laneLinesGroup.remove(child);
      child.geometry.dispose();
      (child.material as THREE.Material).dispose();
    }

    this.envRenderTarget.dispose();
    this.pmremGenerator.dispose();
    this.renderer.dispose();

    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
    if (this.boxOverlay.parentNode === this.container) {
      this.container.removeChild(this.boxOverlay);
    }
  }
}
