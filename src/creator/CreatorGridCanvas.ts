import type {
  BeatflowLevelDocument,
  CreatorMainTab,
  CreatorObject,
  ViewLayerVisibility,
} from '../types/creator';
import type { BeatSnapDivision } from './TimelineEditor';
import { getSnapStepSec, secondsToBarBeat } from './TimelineEditor';
import { isCasillaObject, isTriggerLineObject } from './ObjectLibrary';

export interface CreatorGridCallbacks {
  onSelectObject: (id: string | null, additive: boolean) => void;
  onSelectMany: (ids: string[], additive: boolean) => void;
  onPlaceAt: (lane: number, timeSec: number) => void;
  onDragBegin: () => void;
  onDragMoveSelected: (deltaLane: number, deltaTimeSec: number) => void;
  onDragResizeLong: (objectId: string, nextDurationSec: number) => void;
  onDragEnd: (changed: boolean) => void;
  onScrollChange: (scrollTimeSec: number) => void;
  onSeekPlayhead?: (timeSec: number) => void;
}

export interface GridViewportMetrics {
  scrollTimeSec: number;
  visibleDurationSec: number;
  totalDurationSec: number;
  pixelsPerSec: number;
}

interface PointerSession {
  pointerId: number;
  startX: number;
  startY: number;
  lastY: number;
  mode: 'pending' | 'pan' | 'drag_move' | 'drag_resize' | 'box_select';
  hitObjId: string | null;
  hitIsHandle: boolean;
  startScrollTime: number;
  dragStartLane: number;
  dragStartTime: number;
  lastAppliedDeltaLane: number;
  lastAppliedDeltaTime: number;
  resizeStartDuration: number;
  movedBeyondThreshold: boolean;
  boxCurrentX: number;
  boxCurrentY: number;
}

const LEFT_GUTTER_WIDTH = 44;
const RIGHT_PAD = 54;
const BOTTOM_BASE_OFFSET_PX = 28;
const DRAG_THRESHOLD_PX = 10;

export class CreatorGridCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: CreatorGridCallbacks;

  private level: BeatflowLevelDocument;
  private selectedIds = new Set<string>();
  private mainTab: CreatorMainTab = 'build';
  private editTool: string = 'select';
  private snapDivision: BeatSnapDivision = '1/4';
  private hasActiveBuildItem = true;

  private scrollTimeSec = 0;
  private pixelsPerSec = 155;
  private playbackTimeSec: number | null = null;
  private cursorTimeSec = 0;

  private activePointers = new Map<number, PointerSession>();
  private pinchStartDist: number | null = null;
  private pinchStartPps = 155;

  private rafId = 0;
  private dirty = true;
  private active = true;
  private disposed = false;
  private cssWidth = 360;
  private cssHeight = 520;
  private cachedMaxObjEndSec = 0;
  private visibleTriggerCache: CreatorObject[] = [];
  private visibleCasillaCache: CreatorObject[] = [];
  private resizeObserver: ResizeObserver;

  constructor(
    canvas: HTMLCanvasElement,
    initialLevel: BeatflowLevelDocument,
    callbacks: CreatorGridCallbacks,
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) {
      throw new Error('No se pudo inicializar el contexto 2D de la cuadrícula.');
    }
    this.ctx = context;
    this.level = initialLevel;
    this.callbacks = callbacks;
    this.recomputeMaxObjEnd();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    if (canvas.parentElement) {
      this.resizeObserver.observe(canvas.parentElement);
    }
    this.handleResize();
    this.bindEvents();
    this.scheduleRender();
  }

  private recomputeMaxObjEnd(): void {
    let maxObj = 0;
    const objs = this.level.objects;
    for (let i = 0; i < objs.length; i++) {
      const o = objs[i];
      const end = o.timeSec + (o.noteData?.durationSec ?? 0);
      if (end > maxObj) maxObj = end;
    }
    this.cachedMaxObjEndSec = maxObj;
  }

  private scheduleRender(): void {
    this.dirty = true;
    if (this.disposed || !this.active || this.rafId !== 0) return;
    this.rafId = requestAnimationFrame(this.onAnimationFrame);
  }

  private onAnimationFrame = (): void => {
    this.rafId = 0;
    if (this.disposed || !this.active) return;
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
    if (this.dirty) {
      this.rafId = requestAnimationFrame(this.onAnimationFrame);
    }
  };

  public setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (!active) {
      if (this.rafId !== 0) {
        cancelAnimationFrame(this.rafId);
        this.rafId = 0;
      }
    } else {
      this.scheduleRender();
    }
  }

  public setState(params: {
    level: BeatflowLevelDocument;
    selectedIds?: string[];
    mainTab?: CreatorMainTab;
    editTool?: string;
    snapDivision?: BeatSnapDivision;
    hasActiveBuildItem?: boolean;
  }): void {
    const levelChanged = this.level !== params.level;
    this.level = params.level;
    if (levelChanged) {
      this.recomputeMaxObjEnd();
    }
    if (params.selectedIds !== undefined) {
      this.selectedIds = new Set(params.selectedIds);
    }
    if (params.mainTab !== undefined) this.mainTab = params.mainTab;
    if (params.editTool !== undefined) this.editTool = params.editTool;
    if (params.snapDivision !== undefined) this.snapDivision = params.snapDivision;
    if (params.hasActiveBuildItem !== undefined) {
      this.hasActiveBuildItem = params.hasActiveBuildItem;
    }
    this.scheduleRender();
  }

  public setPlaybackTime(timeSec: number | null, followPlayhead = false): void {
    if (this.playbackTimeSec === timeSec) return;
    this.playbackTimeSec = timeSec;
    if (timeSec !== null) {
      this.cursorTimeSec = timeSec;
      if (followPlayhead) {
        const visibleDur = this.getVisibleDurationSec();
        const target = Math.max(0, timeSec - visibleDur * 0.28);
        this.setScrollTime(target);
      }
    }
    this.scheduleRender();
  }

  public getCursorTimeSec(): number {
    return this.cursorTimeSec;
  }

  public setScrollTime(nextSec: number): void {
    const maxScroll = Math.max(0, this.getTotalDurationSec() - this.getVisibleDurationSec() * 0.4);
    const clamped = Math.max(0, Math.min(maxScroll, nextSec));
    if (Math.abs(clamped - this.scrollTimeSec) > 0.001) {
      this.scrollTimeSec = clamped;
      this.cursorTimeSec = clamped;
      this.callbacks.onScrollChange(this.scrollTimeSec);
      this.scheduleRender();
    }
  }

  public scrollByBeats(beatsDelta: number): void {
    const beatDur = 60 / Math.max(40, this.level.audio.bpm);
    this.setScrollTime(this.scrollTimeSec + beatsDelta * beatDur);
  }

  public setZoomPixelsPerSec(pps: number): void {
    const next = Math.max(70, Math.min(340, pps));
    if (Math.abs(next - this.pixelsPerSec) < 0.1) return;
    this.pixelsPerSec = next;
    this.scheduleRender();
  }

  public getViewportMetrics(): GridViewportMetrics {
    return {
      scrollTimeSec: this.scrollTimeSec,
      visibleDurationSec: this.getVisibleDurationSec(),
      totalDurationSec: this.getTotalDurationSec(),
      pixelsPerSec: this.pixelsPerSec,
    };
  }

  private getTotalDurationSec(): number {
    return Math.max(16, this.level.audio.durationSec, this.cachedMaxObjEndSec + 6);
  }

  private getVisibleDurationSec(): number {
    return Math.max(1, (this.cssHeight - BOTTOM_BASE_OFFSET_PX) / this.pixelsPerSec);
  }

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    const w = Math.max(220, parent ? parent.clientWidth : window.innerWidth);
    const h = Math.max(200, parent ? parent.clientHeight : 420);
    const isCoarse =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;
    const maxDpr = isCoarse ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    this.cssWidth = w;
    this.cssHeight = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.scheduleRender();
  }

  private getLaneGeometry(): { laneCount: number; trackLeft: number; trackWidth: number; laneWidth: number } {
    const laneCount = Math.max(4, this.level.gameplayRules.laneCount || 4);
    const trackLeft = LEFT_GUTTER_WIDTH;
    const trackWidth = Math.max(120, this.cssWidth - LEFT_GUTTER_WIDTH - RIGHT_PAD);
    const laneWidth = trackWidth / laneCount;
    return { laneCount, trackLeft, trackWidth, laneWidth };
  }

  private timeToY(timeSec: number): number {
    return this.cssHeight - BOTTOM_BASE_OFFSET_PX - (timeSec - this.scrollTimeSec) * this.pixelsPerSec;
  }

  private yToTime(y: number): number {
    return Math.max(0, this.scrollTimeSec + (this.cssHeight - BOTTOM_BASE_OFFSET_PX - y) / this.pixelsPerSec);
  }

  private xToLane(x: number): number {
    const { laneCount, trackLeft, laneWidth } = this.getLaneGeometry();
    if (x < trackLeft) return -1;
    return Math.max(0, Math.min(laneCount - 1, Math.floor((x - trackLeft) / laneWidth)));
  }

  private hitTestObject(x: number, y: number): { obj: CreatorObject | null; isResizeHandle: boolean } {
    const { trackLeft, laneWidth } = this.getLaneGeometry();
    const view = this.level.viewSettings;

    // 1. Check resize handles on currently selected long tiles first
    for (let i = this.level.objects.length - 1; i >= 0; i--) {
      const obj = this.level.objects[i];
      if (!this.selectedIds.has(obj.id)) continue;
      if (!obj.noteData || (obj.type !== 'note_hold' && obj.type !== 'note_slide' && obj.noteData.casillaShape !== 'long')) {
        continue;
      }
      const dur = Math.max(0.15, obj.noteData.durationSec || 0.5);
      const lane = Math.max(0, obj.lane);
      const cx = trackLeft + (lane + 0.5) * laneWidth;
      const topY = this.timeToY(obj.timeSec + dur);
      if (Math.abs(x - cx) <= Math.max(24, laneWidth * 0.48) && Math.abs(y - topY) <= 18) {
        return { obj, isResizeHandle: true };
      }
    }

    // 2. Check Casillas (top-most first)
    if (!view || view.casillas) {
      for (let i = this.level.objects.length - 1; i >= 0; i--) {
        const obj = this.level.objects[i];
        if (obj.hidden || isTriggerLineObject(obj)) continue;
        if (obj.lane < 0) continue;
        const cx = trackLeft + (obj.lane + 0.5) * laneWidth;
        const baseY = this.timeToY(obj.timeSec);
        const dur = obj.noteData?.durationSec ?? 0;
        const topY = dur > 0.05 ? this.timeToY(obj.timeSec + dur) : baseY;
        const minY = Math.min(baseY, topY) - 20;
        const maxY = Math.max(baseY, topY) + 20;
        const halfW = Math.max(22, laneWidth * 0.44);
        if (Math.abs(x - cx) <= halfW && y >= minY && y <= maxY) {
          return { obj, isResizeHandle: false };
        }
      }
    }

    // 3. Check Triggers in left gutter OR along their green horizontal activation line
    if (!view || view.triggerLines) {
      for (let i = this.level.objects.length - 1; i >= 0; i--) {
        const obj = this.level.objects[i];
        if (obj.hidden || !isTriggerLineObject(obj)) continue;
        const ty = this.timeToY(obj.timeSec);
        if (x <= LEFT_GUTTER_WIDTH + 6 && Math.abs(y - ty) <= 18) {
          return { obj, isResizeHandle: false };
        }
        // Tapping directly on the horizontal green line when not on a casilla also selects trigger
        if (Math.abs(y - ty) <= 10) {
          return { obj, isResizeHandle: false };
        }
      }
    }

    return { obj: null, isResizeHandle: false };
  }

  private bindEvents(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
  }

  private getCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }

    const { x, y } = this.getCanvasCoords(e.clientX, e.clientY);

    // Handle 2-finger pinch zoom without intermediate array allocation
    if (this.activePointers.size === 1) {
      const first = this.activePointers.values().next();
      if (!first.done) {
        const other = first.value;
        this.pinchStartDist = Math.hypot(x - other.startX, y - other.startY);
        this.pinchStartPps = this.pixelsPerSec;
      }
    }

    const hit = this.hitTestObject(x, y);
    const tapTime = this.yToTime(y);
    const tapLane = this.xToLane(x);

    let initialMode: PointerSession['mode'] = 'pending';
    if (hit.isResizeHandle && hit.obj) {
      initialMode = 'drag_resize';
      this.callbacks.onDragBegin();
    } else if (
      this.mainTab === 'edit' &&
      this.editTool === 'move' &&
      hit.obj &&
      this.selectedIds.has(hit.obj.id)
    ) {
      initialMode = 'drag_move';
      this.callbacks.onDragBegin();
    } else if (
      this.mainTab === 'edit' &&
      this.editTool === 'resize_long' &&
      hit.obj &&
      hit.obj.noteData &&
      (hit.obj.type === 'note_hold' || hit.obj.type === 'note_slide' || hit.obj.noteData.casillaShape === 'long')
    ) {
      initialMode = 'drag_resize';
      this.callbacks.onDragBegin();
    } else if (this.mainTab === 'edit' && this.editTool === 'box_select' && !hit.obj) {
      initialMode = 'box_select';
    }

    this.activePointers.set(e.pointerId, {
      pointerId: e.pointerId,
      startX: x,
      startY: y,
      lastY: y,
      mode: initialMode,
      hitObjId: hit.obj?.id ?? null,
      hitIsHandle: hit.isResizeHandle,
      startScrollTime: this.scrollTimeSec,
      dragStartLane: tapLane,
      dragStartTime: tapTime,
      lastAppliedDeltaLane: 0,
      lastAppliedDeltaTime: 0,
      resizeStartDuration: hit.obj?.noteData?.durationSec ?? 0.75,
      movedBeyondThreshold: false,
      boxCurrentX: x,
      boxCurrentY: y,
    });
    if (initialMode === 'box_select') {
      this.scheduleRender();
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    const sess = this.activePointers.get(e.pointerId);
    if (!sess) return;
    const { x, y } = this.getCanvasCoords(e.clientX, e.clientY);

    // Pinch zoom when 2 pointers active
    if (this.activePointers.size >= 2 && this.pinchStartDist) {
      let other: PointerSession | null = null;
      for (const p of this.activePointers.values()) {
        if (p.pointerId !== e.pointerId) {
          other = p;
          break;
        }
      }
      if (other) {
        const dist = Math.hypot(x - other.boxCurrentX, y - other.boxCurrentY);
        const ratio = dist / Math.max(20, this.pinchStartDist);
        this.setZoomPixelsPerSec(this.pinchStartPps * ratio);
        sess.boxCurrentX = x;
        sess.boxCurrentY = y;
        return;
      }
    }

    sess.boxCurrentX = x;
    sess.boxCurrentY = y;

    const dx = x - sess.startX;
    const dy = y - sess.startY;
    if (!sess.movedBeyondThreshold && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
      sess.movedBeyondThreshold = true;
      if (sess.mode === 'pending') {
        if (this.mainTab === 'edit' && this.editTool === 'move' && sess.hitObjId) {
          if (!this.selectedIds.has(sess.hitObjId)) {
            this.callbacks.onSelectObject(sess.hitObjId, false);
          }
          sess.mode = 'drag_move';
          this.callbacks.onDragBegin();
        } else {
          sess.mode = 'pan';
        }
      }
    }

    let needsVisualUpdate = false;
    if (sess.mode === 'pan') {
      // Natural vertical touch scroll: dragging finger down pulls higher times down into view (increases scrollTime)
      const totalDy = y - sess.startY;
      this.setScrollTime(sess.startScrollTime + totalDy / this.pixelsPerSec);
    } else if (sess.mode === 'drag_move' && sess.movedBeyondThreshold) {
      const curLane = this.xToLane(x);
      const curTime = this.yToTime(y);
      const rawDeltaLane =
        curLane >= 0 && sess.dragStartLane >= 0 ? curLane - sess.dragStartLane : 0;
      const step = Math.max(0.05, getSnapStepSec(this.level.audio.bpm, this.snapDivision) || 0.05);
      const rawDeltaTime = Math.round((curTime - sess.dragStartTime) / step) * step;

      const incLane = rawDeltaLane - sess.lastAppliedDeltaLane;
      const incTime = Number((rawDeltaTime - sess.lastAppliedDeltaTime).toFixed(3));
      if (incLane !== 0 || Math.abs(incTime) >= 0.01) {
        sess.lastAppliedDeltaLane = rawDeltaLane;
        sess.lastAppliedDeltaTime = rawDeltaTime;
        this.callbacks.onDragMoveSelected(incLane, incTime);
        needsVisualUpdate = true;
      }
    } else if (sess.mode === 'drag_resize' && sess.hitObjId && sess.movedBeyondThreshold) {
      const deltaTime = (sess.startY - y) / this.pixelsPerSec;
      const nextDur = Math.max(0.15, sess.resizeStartDuration + deltaTime);
      this.callbacks.onDragResizeLong(sess.hitObjId, nextDur);
      needsVisualUpdate = true;
    } else if (sess.mode === 'box_select' && sess.movedBeyondThreshold) {
      needsVisualUpdate = true;
    }

    sess.lastY = y;
    if (needsVisualUpdate) {
      this.scheduleRender();
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    const sess = this.activePointers.get(e.pointerId);
    if (!sess) return;
    this.activePointers.delete(e.pointerId);
    if (this.activePointers.size < 2) {
      this.pinchStartDist = null;
    }

    const { x, y } = this.getCanvasCoords(e.clientX, e.clientY);

    if (sess.mode === 'drag_move' || sess.mode === 'drag_resize') {
      const changed =
        sess.movedBeyondThreshold &&
        (sess.lastAppliedDeltaLane !== 0 ||
          Math.abs(sess.lastAppliedDeltaTime) > 0.001 ||
          sess.mode === 'drag_resize');
      this.callbacks.onDragEnd(changed);
      this.scheduleRender();
      return;
    }

    if (sess.mode === 'box_select' && sess.movedBeyondThreshold) {
      const minX = Math.min(sess.startX, x);
      const maxX = Math.max(sess.startX, x);
      const minY = Math.min(sess.startY, y);
      const maxY = Math.max(sess.startY, y);
      const { trackLeft, laneWidth } = this.getLaneGeometry();
      const hitIds: string[] = [];
      for (const obj of this.level.objects) {
        if (obj.hidden) continue;
        const ox = isTriggerLineObject(obj)
          ? LEFT_GUTTER_WIDTH * 0.5
          : trackLeft + (Math.max(0, obj.lane) + 0.5) * laneWidth;
        const oy = this.timeToY(obj.timeSec);
        if (ox >= minX && ox <= maxX && oy >= minY && oy <= maxY) {
          hitIds.push(obj.id);
        }
      }
      this.callbacks.onSelectMany(hitIds, true);
      this.scheduleRender();
      return;
    }

    // Pure Tap (no drag): never moves objects accidentally!
    if (!sess.movedBeyondThreshold) {
      const tapTime = this.yToTime(y);
      const tapLane = this.xToLane(x);
      this.cursorTimeSec = tapTime;

      if (sess.hitObjId) {
        const additive = this.mainTab === 'edit' && (this.editTool === 'multi_select' || e.shiftKey);
        this.callbacks.onSelectObject(sess.hitObjId, additive);
      } else if (this.mainTab === 'build' && this.hasActiveBuildItem && tapLane >= 0) {
        this.callbacks.onPlaceAt(tapLane, tapTime);
      } else if (this.mainTab === 'build' && this.hasActiveBuildItem && x <= LEFT_GUTTER_WIDTH) {
        // Allow tapping left gutter to place triggers or deselect
        this.callbacks.onPlaceAt(0, tapTime);
      } else {
        this.callbacks.onSelectObject(null, false);
        this.callbacks.onSeekPlayhead?.(tapTime);
      }
    }

    this.scheduleRender();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      this.setZoomPixelsPerSec(this.pixelsPerSec * factor);
      return;
    }
    const deltaSec = -e.deltaY / this.pixelsPerSec;
    this.setScrollTime(this.scrollTimeSec + deltaSec);
  };

  public forceRender(): void {
    this.scheduleRender();
  }

  private render(): void {
    const ctx = this.ctx;
    const w = this.cssWidth;
    const h = this.cssHeight;
    const view: ViewLayerVisibility = this.level.viewSettings ?? {
      grid: true,
      casillas: true,
      triggerLines: true,
      cameraFx: true,
      pulses: true,
      particles: true,
      beatGuides: true,
    };

    // 1. Clean high-contrast 2D workspace backdrop
    ctx.fillStyle = '#070b1a';
    ctx.fillRect(0, 0, w, h);

    const { laneCount, trackLeft, trackWidth, laneWidth } = this.getLaneGeometry();
    const minVisTime = Math.max(0, this.scrollTimeSec - 0.5);
    const maxVisTime = this.scrollTimeSec + this.getVisibleDurationSec() + 0.5;

    // Left trigger gutter backdrop
    ctx.fillStyle = '#0b1228';
    ctx.fillRect(0, 0, trackLeft, h);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(trackLeft, 0);
    ctx.lineTo(trackLeft, h);
    ctx.stroke();

    // Alternating subtle lane columns
    for (let l = 0; l < laneCount; l++) {
      const lx = trackLeft + l * laneWidth;
      if (l % 2 === 1) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.fillRect(lx, 0, laneWidth, h);
      }
      if (view.grid && l > 0) {
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.16)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(lx, 0);
        ctx.lineTo(lx, h);
        ctx.stroke();
      }
    }

    // 2. Musical Beat & Bar Guides (linked to BPM & audio offset)
    if (view.grid || view.beatGuides) {
      const bpm = Math.max(40, this.level.audio.bpm || 124);
      const beatDur = 60 / bpm;
      const offsetSec = (this.level.audio.offsetMs || 0) / 1000;
      const subStep = getSnapStepSec(bpm, this.snapDivision);

      // Subdivision lines
      if (view.grid && subStep > 0 && subStep * this.pixelsPerSec >= 12) {
        const startIdx = Math.max(0, Math.floor((minVisTime - offsetSec) / subStep));
        const endIdx = Math.ceil((maxVisTime - offsetSec) / subStep);
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let idx = startIdx; idx <= endIdx; idx++) {
          const t = offsetSec + idx * subStep;
          if (t < 0) continue;
          const y = this.timeToY(t);
          ctx.moveTo(trackLeft, y);
          ctx.lineTo(w - RIGHT_PAD, y);
        }
        ctx.stroke();
      }

      // Beat & Bar lines
      const startBeat = Math.max(0, Math.floor((minVisTime - offsetSec) / beatDur));
      const endBeat = Math.ceil((maxVisTime - offsetSec) / beatDur);
      ctx.font = '600 10px ui-monospace, SFMono-Regular, Menlo, monospace';
      ctx.textBaseline = 'middle';

      for (let b = startBeat; b <= endBeat; b++) {
        const t = offsetSec + b * beatDur;
        if (t < 0) continue;
        const y = this.timeToY(t);
        const isBar = b % 4 === 0;

        if (isBar && view.beatGuides) {
          ctx.strokeStyle = 'rgba(34, 211, 238, 0.34)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(trackLeft, y);
          ctx.lineTo(w - RIGHT_PAD, y);
          ctx.stroke();

          const barInfo = secondsToBarBeat(t, bpm, this.level.audio.offsetMs);
          ctx.fillStyle = 'rgba(125, 211, 252, 0.85)';
          ctx.fillText(`${barInfo.bar}`, 6, y);
        } else if (view.grid) {
          ctx.strokeStyle = 'rgba(148, 163, 184, 0.19)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(trackLeft, y);
          ctx.lineTo(w - RIGHT_PAD, y);
          ctx.stroke();
        }
      }
    }

    // Single-pass viewport culling into reusable arrays
    this.visibleTriggerCache.length = 0;
    this.visibleCasillaCache.length = 0;
    const allObjects = this.level.objects;
    for (let i = 0; i < allObjects.length; i++) {
      const obj = allObjects[i];
      if (obj.hidden) continue;
      if (isTriggerLineObject(obj)) {
        if (view.triggerLines && obj.timeSec >= minVisTime - 1 && obj.timeSec <= maxVisTime + 1) {
          this.visibleTriggerCache.push(obj);
        }
      } else if (view.casillas) {
        const dur = obj.noteData?.durationSec ?? 0;
        if (obj.timeSec + dur >= minVisTime && obj.timeSec <= maxVisTime) {
          this.visibleCasillaCache.push(obj);
        }
      }
    }

    // 3. Green Horizontal Trigger Activation Lines (PDF 1 & PDF 2 requirement)
    if (view.triggerLines && this.visibleTriggerCache.length > 0) {
      for (let i = 0; i < this.visibleTriggerCache.length; i++) {
        const obj = this.visibleTriggerCache[i];
        const trigType = obj.trigger?.type;
        if ((trigType === 'camera_fx' || trigType === 'camera' || trigType === 'screen_fx') && !view.cameraFx) {
          continue;
        }
        if ((trigType === 'screen_pulse' || trigType === 'pulse') && !view.pulses) {
          continue;
        }

        const y = this.timeToY(obj.timeSec);
        const isSelected = this.selectedIds.has(obj.id);

        // Green horizontal line across lanes
        ctx.save();
        ctx.strokeStyle = isSelected ? '#4ade80' : 'rgba(34, 197, 94, 0.72)';
        ctx.lineWidth = isSelected ? 2.4 : 1.5;
        ctx.setLineDash(isSelected ? [] : [6, 4]);
        ctx.beginPath();
        ctx.moveTo(trackLeft, y);
        ctx.lineTo(w - RIGHT_PAD, y);
        ctx.stroke();
        ctx.restore();

        // Trigger chip inside left gutter
        const badgeColor =
          trigType === 'camera_fx' || trigType === 'camera' || trigType === 'screen_fx'
            ? '#38bdf8'
            : trigType === 'screen_pulse' || trigType === 'pulse'
              ? '#22c55e'
              : trigType === 'background'
                ? '#ec4899'
                : '#f59e0b';
        const shortTag =
          trigType === 'camera_fx'
            ? 'CAM'
            : trigType === 'screen_pulse'
              ? 'PLS'
              : trigType === 'background'
                ? 'BG'
                : 'TRG';

        ctx.fillStyle = isSelected ? '#14532d' : '#0f172a';
        ctx.strokeStyle = isSelected ? '#4ade80' : badgeColor;
        ctx.lineWidth = isSelected ? 2 : 1.25;
        this.roundRectPath(ctx, 4, y - 11, LEFT_GUTTER_WIDTH - 8, 22, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = isSelected ? '#dcfce7' : badgeColor;
        ctx.font = '700 9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(shortTag, LEFT_GUTTER_WIDTH / 2, y);
        ctx.textAlign = 'left';
      }
    }

    // 4. Casillas (and legacy objects if present from v1/v2 migration)
    if (view.casillas && this.visibleCasillaCache.length > 0) {
      for (let i = 0; i < this.visibleCasillaCache.length; i++) {
        const obj = this.visibleCasillaCache[i];
        const dur = obj.noteData?.durationSec ?? 0;

        const lane = obj.lane >= 0 ? Math.min(laneCount - 1, obj.lane) : 0;
        const cx = trackLeft + (lane + 0.5) * laneWidth;
        const baseY = this.timeToY(obj.timeSec);
        const isSelected = this.selectedIds.has(obj.id);
        const primary = obj.material.color || '#22d3ee';
        const secondary = obj.material.secondaryColor || primary;
        const useCombo =
          obj.material.colorComboMode && obj.material.colorComboMode !== 'solid';

        // Subtle particle/glow halo if View.particles is active
        if (view.particles) {
          ctx.fillStyle = primary;
          ctx.globalAlpha = isSelected ? 0.22 : 0.1;
          ctx.beginPath();
          ctx.arc(cx, baseY, Math.min(laneWidth * 0.48, 28), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        // Long tile / hold / slide body (layered flat fill avoids per-frame LinearGradient allocations)
        const isLong =
          obj.type === 'note_hold' ||
          obj.type === 'note_slide' ||
          obj.noteData?.casillaShape === 'long' ||
          dur > 0.08;

        if (isLong && dur > 0.05) {
          const topY = this.timeToY(obj.timeSec + dur);
          const bodyW = Math.min(laneWidth * 0.62, 40);
          const bodyH = Math.max(18, baseY - topY);

          ctx.globalAlpha = 0.34;
          ctx.fillStyle = primary;
          this.roundRectPath(ctx, cx - bodyW / 2, topY, bodyW, bodyH, 8);
          ctx.fill();
          if (useCombo) {
            ctx.globalAlpha = 0.22;
            ctx.fillStyle = secondary;
            this.roundRectPath(ctx, cx - bodyW / 2, topY, bodyW, bodyH * 0.45, 8);
            ctx.fill();
          }
          ctx.globalAlpha = 0.92;
          ctx.strokeStyle = isSelected ? '#ffffff' : primary;
          ctx.lineWidth = isSelected ? 2 : 1.3;
          this.roundRectPath(ctx, cx - bodyW / 2, topY, bodyW, bodyH, 8);
          ctx.stroke();
          ctx.globalAlpha = 1;

          // Slide lane target indicator
          if (
            obj.type === 'note_slide' &&
            obj.noteData?.slideTargetLane !== undefined &&
            obj.noteData.slideTargetLane !== lane
          ) {
            const targetCx =
              trackLeft + (Math.max(0, Math.min(laneCount - 1, obj.noteData.slideTargetLane)) + 0.5) * laneWidth;
            ctx.save();
            ctx.strokeStyle = '#2dd4bf';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(cx, baseY);
            ctx.lineTo(targetCx, topY);
            ctx.stroke();
            ctx.restore();
          }

          // Top duration resize handle when selected
          if (isSelected) {
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = primary;
            ctx.lineWidth = 2;
            this.roundRectPath(ctx, cx - 14, topY - 7, 28, 12, 5);
            ctx.fill();
            ctx.stroke();

            ctx.fillStyle = '#e2e8f0';
            ctx.font = '700 10px ui-monospace, monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${dur.toFixed(2)}s`, cx, topY - 16);
            ctx.textAlign = 'left';
          }
        }

        // Draw Casilla Head Shape
        const size = Math.min(laneWidth * 0.72, 44);
        const half = size * 0.5;
        const casillaShape =
          obj.noteData?.casillaShape ??
          (obj.material.shape === 'disc'
            ? 'circle'
            : obj.material.shape === 'prism'
              ? 'triangle'
              : obj.material.shape === 'diamond'
                ? 'diamond'
                : 'square');

        const fillStyle = useCombo
          ? (() => {
              const g = ctx.createLinearGradient(cx - half, baseY - half, cx + half, baseY + half);
              g.addColorStop(0, primary);
              g.addColorStop(1, secondary);
              return g;
            })()
          : primary;

        ctx.save();
        ctx.fillStyle = fillStyle;
        ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.72)';
        ctx.lineWidth = isSelected ? 2.6 : 1.4;

        if (!isCasillaObject(obj)) {
          // Legacy v1/v2 readable marker
          ctx.globalAlpha = 0.55;
          ctx.setLineDash([3, 3]);
          this.roundRectPath(ctx, cx - half * 0.85, baseY - 12, size * 0.85, 24, 5);
          ctx.fill();
          ctx.stroke();
        } else if (casillaShape === 'circle') {
          ctx.beginPath();
          ctx.arc(cx, baseY, half * 0.82, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (casillaShape === 'triangle') {
          const r = half * 0.92;
          ctx.beginPath();
          ctx.moveTo(cx, baseY - r);
          ctx.lineTo(cx + r * 0.92, baseY + r * 0.72);
          ctx.lineTo(cx - r * 0.92, baseY + r * 0.72);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (casillaShape === 'diamond') {
          const r = half * 0.92;
          ctx.beginPath();
          ctx.moveTo(cx, baseY - r);
          ctx.lineTo(cx + r, baseY);
          ctx.lineTo(cx, baseY + r);
          ctx.lineTo(cx - r, baseY);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else {
          // square or long head
          const hBox = isLong ? 22 : half * 1.48;
          this.roundRectPath(ctx, cx - half, baseY - hBox / 2, size, hBox, 7);
          ctx.fill();
          ctx.stroke();
        }

        // Selection outer highlight frame
        if (isSelected) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.setLineDash([4, 3]);
          this.roundRectPath(ctx, cx - half - 5, baseY - half - 5, size + 10, size + 10, 9);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // 5. Playback Music Moving Progress Indicator Line (Audio Preview Only)
    if (this.playbackTimeSec !== null) {
      const py = this.timeToY(this.playbackTimeSec);
      if (py >= -10 && py <= h + 10) {
        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
        ctx.stroke();

        ctx.fillStyle = '#0284c7';
        this.roundRectPath(ctx, 2, py - 10, LEFT_GUTTER_WIDTH - 4, 20, 5);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${this.playbackTimeSec.toFixed(1)}s`, LEFT_GUTTER_WIDTH / 2, py);
        ctx.textAlign = 'left';
        ctx.restore();
      }
    }

    // 6. Box-select marquee overlay
    for (const sess of this.activePointers.values()) {
      if (sess.mode === 'box_select' && sess.movedBeyondThreshold) {
        const bx = Math.min(sess.startX, sess.boxCurrentX);
        const by = Math.min(sess.startY, sess.boxCurrentY);
        const bw = Math.abs(sess.boxCurrentX - sess.startX);
        const bh = Math.abs(sess.boxCurrentY - sess.startY);
        ctx.save();
        ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.restore();
      }
    }

    // 7. Bottom Playhead Baseline + Lane Indices
    const baseY = h - BOTTOM_BASE_OFFSET_PX;
    ctx.fillStyle = 'rgba(10, 15, 34, 0.92)';
    ctx.fillRect(0, baseY, w, BOTTOM_BASE_OFFSET_PX);
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    ctx.lineTo(w, baseY);
    ctx.stroke();

    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let l = 0; l < laneCount; l++) {
      const cx = trackLeft + (l + 0.5) * laneWidth;
      ctx.fillStyle = 'rgba(203, 213, 225, 0.78)';
      ctx.fillText(`C${l + 1}`, cx, baseY + BOTTOM_BASE_OFFSET_PX / 2);
    }
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = '600 9px ui-monospace, monospace';
    ctx.fillText('FX', LEFT_GUTTER_WIDTH / 2, baseY + BOTTOM_BASE_OFFSET_PX / 2);
    ctx.textAlign = 'left';
  }

  private roundRectPath(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.resizeObserver.disconnect();
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }
}
