import type { DifficultyLevel, LaneCount, MusicProfile } from '../types/game';
import type {
  BeatflowLevelDocument,
  CreatorMaterialSpec,
  CreatorObject,
  CreatorObjectType,
  TimelineKeyframe,
  TimelineMarker,
  TriggerConfigPayload,
  TriggerType,
  ViewLayerVisibility,
} from '../types/creator';
import { getPresetGenerationConfig } from '../services/recordsStorage';
import { generateProceduralLevel } from '../services/levelGenerator';
import {
  CREATOR_BUILD_ITEMS,
  CreatorBuildItem,
  createObjectFromBuildItem,
  createObjectFromTemplate,
  generateCreatorObjectId,
} from './ObjectLibrary';
import { GroupManager } from './GroupManager';
import {
  BeatSnapDivision,
  duplicateObjectsSequence,
  getSnapStepSec,
  snapTimeToBeat,
} from './TimelineEditor';
import { createDefaultViewSettings, createEmptyLevelDocument } from './LevelSerializer';

export type EditorToolMode =
  | 'select'
  | 'move'
  | 'rotate'
  | 'scale'
  | 'place'
  | 'box_select'
  | 'multi_select'
  | 'resize_long';

export interface CreatorEditorSnapshot {
  level: BeatflowLevelDocument;
  selectedIds: string[];
  activeTool: EditorToolMode;
  activeLayer: number;
  snapDivision: BeatSnapDivision;
  gridSize: number;
  canUndo: boolean;
  canRedo: boolean;
  clipboardCount: number;
}

const MAX_UNDO_HISTORY = 60;

/**
 * Self-contained BeatFlow Creator editor state controller:
 * - History Undo/Redo stack (with batched interactive gesture support)
 * - Multi-selection, clipboard copy/cut/paste/duplicate, pattern repeat
 * - Musical Beat snapping (1/1, 1/2, 1/4, 1/8, 1/16, free)
 * - 4-way movement, long-tile duration resize, grouping & batch RGB updates
 * - Visual-only ViewLayerVisibility toggles
 */
export class CreatorEditor {
  private level: BeatflowLevelDocument;
  private selectedIds = new Set<string>();
  private activeTool: EditorToolMode = 'select';
  private activeLayer = 1;
  private snapDivision: BeatSnapDivision = '1/4';
  private gridSize = 0.5;
  private clipboard: CreatorObject[] = [];
  private undoStack: BeatflowLevelDocument[] = [];
  private redoStack: BeatflowLevelDocument[] = [];
  private interactiveGestureSnapshot: BeatflowLevelDocument | null = null;

  constructor(initialLevel?: BeatflowLevelDocument) {
    this.level = initialLevel ? structuredClone(initialLevel) : createEmptyLevelDocument();
    this.level.groups = GroupManager.ensureDefaultGroup(this.level.groups);
    if (!this.level.viewSettings) {
      this.level.viewSettings = createDefaultViewSettings();
    }
  }

  public getSnapshot(): CreatorEditorSnapshot {
    return {
      level: this.level,
      selectedIds: Array.from(this.selectedIds),
      activeTool: this.activeTool,
      activeLayer: this.activeLayer,
      snapDivision: this.snapDivision,
      gridSize: this.gridSize,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      clipboardCount: this.clipboard.length,
    };
  }

  public getLevel(): BeatflowLevelDocument {
    return this.level;
  }

  public getViewSettings(): ViewLayerVisibility {
    return this.level.viewSettings ?? createDefaultViewSettings();
  }

  public updateViewSettings(patch: Partial<ViewLayerVisibility>): ViewLayerVisibility {
    const next: ViewLayerVisibility = {
      ...this.getViewSettings(),
      ...patch,
    };
    this.level = {
      ...this.level,
      viewSettings: next,
    };
    return next;
  }

  public setLevel(next: BeatflowLevelDocument, recordHistory = true): void {
    if (recordHistory) this.pushUndo();
    this.level = structuredClone(next);
    this.level.groups = GroupManager.ensureDefaultGroup(this.level.groups);
    if (!this.level.viewSettings) {
      this.level.viewSettings = createDefaultViewSettings();
    }
    this.selectedIds.clear();
  }

  private pushUndo(): void {
    this.undoStack.push(structuredClone(this.level));
    if (this.undoStack.length > MAX_UNDO_HISTORY) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  public beginInteractiveTransform(): void {
    if (!this.interactiveGestureSnapshot) {
      this.interactiveGestureSnapshot = structuredClone(this.level);
    }
  }

  public commitInteractiveTransform(changed: boolean): void {
    if (!this.interactiveGestureSnapshot) return;
    if (changed) {
      this.undoStack.push(this.interactiveGestureSnapshot);
      if (this.undoStack.length > MAX_UNDO_HISTORY) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }
    this.interactiveGestureSnapshot = null;
  }

  public undo(): boolean {
    const prev = this.undoStack.pop();
    if (!prev) return false;
    this.redoStack.push(structuredClone(this.level));
    this.level = prev;
    this.selectedIds = new Set(
      Array.from(this.selectedIds).filter((id) => this.level.objects.some((o) => o.id === id)),
    );
    return true;
  }

  public redo(): boolean {
    const next = this.redoStack.pop();
    if (!next) return false;
    this.undoStack.push(structuredClone(this.level));
    this.level = next;
    this.selectedIds = new Set(
      Array.from(this.selectedIds).filter((id) => this.level.objects.some((o) => o.id === id)),
    );
    return true;
  }

  public setTool(tool: EditorToolMode): void {
    this.activeTool = tool;
  }

  public setSnapDivision(div: BeatSnapDivision): void {
    this.snapDivision = div;
  }

  public getSnapStepSec(): number {
    const step = getSnapStepSec(this.level.audio.bpm, this.snapDivision);
    return step > 0 ? step : 0.05;
  }

  public setGridSize(size: number): void {
    this.gridSize = Math.max(0.1, Math.min(2, size));
  }

  public setActiveLayer(layer: number): void {
    this.activeLayer = Math.max(0, Math.min(7, layer));
  }

  public selectSingle(id: string | null, additive = false): void {
    if (!id) {
      if (!additive) this.selectedIds.clear();
      return;
    }
    if (!additive) {
      this.selectedIds.clear();
    }
    if (additive && this.selectedIds.has(id)) {
      this.selectedIds.delete(id);
    } else {
      this.selectedIds.add(id);
    }
  }

  public selectMany(ids: string[], additive = false): void {
    if (!additive) this.selectedIds.clear();
    for (const id of ids) {
      this.selectedIds.add(id);
    }
  }

  public selectGroup(groupId: number): void {
    const ids = GroupManager.getObjectIdsInGroup(this.level.objects, groupId);
    this.selectMany(ids, false);
  }

  public snapSpatialValue(val: number): number {
    if (this.gridSize <= 0) return Number(val.toFixed(2));
    return Number((Math.round(val / this.gridSize) * this.gridSize).toFixed(2));
  }

  public snapTime(timeSec: number): number {
    return snapTimeToBeat(
      timeSec,
      this.level.audio.bpm,
      this.level.audio.offsetMs,
      this.snapDivision,
    );
  }

  public placeBuildItem(
    item: CreatorBuildItem,
    options: {
      timeSec: number;
      lane: number;
    },
  ): CreatorObject {
    this.pushUndo();
    const laneCount = this.level.gameplayRules.laneCount;
    const snappedTime = this.snapTime(options.timeSec);
    const created = createObjectFromBuildItem(item, {
      timeSec: snappedTime,
      lane: options.lane,
      laneCount,
      primaryPaletteColor: this.level.audio.palette.primary,
      secondaryPaletteColor: this.level.audio.palette.secondary,
    });
    created.layer = this.activeLayer;

    // Ensure duration grows automatically if placing far into timeline
    const neededDuration = Math.max(
      this.level.audio.durationSec,
      Math.ceil(snappedTime + (created.noteData?.durationSec ?? 0) + 4),
    );

    this.level = {
      ...this.level,
      audio:
        neededDuration > this.level.audio.durationSec
          ? { ...this.level.audio, durationSec: neededDuration }
          : this.level.audio,
      objects: [...this.level.objects, created].sort((a, b) => a.timeSec - b.timeSec),
    };
    this.selectedIds = new Set([created.id]);
    return created;
  }

  public placeObject(
    type: CreatorObjectType,
    options: {
      timeSec: number;
      lane?: number;
      position?: { x: number; y: number; z: number };
      triggerType?: TriggerType;
    },
  ): CreatorObject {
    this.pushUndo();
    const laneCount = this.level.gameplayRules.laneCount;
    const snappedTime = this.snapTime(options.timeSec);
    const created = createObjectFromTemplate(type, {
      timeSec: snappedTime,
      lane: options.lane,
      laneCount,
      position: options.position
        ? {
            x: this.snapSpatialValue(options.position.x),
            y: this.snapSpatialValue(options.position.y),
            z: this.snapSpatialValue(options.position.z),
          }
        : undefined,
      triggerType: options.triggerType,
    });
    created.layer = this.activeLayer;
    this.level = {
      ...this.level,
      objects: [...this.level.objects, created].sort((a, b) => a.timeSec - b.timeSec),
    };
    this.selectedIds = new Set([created.id]);
    return created;
  }

  public mutateObjects(
    updater: (objects: CreatorObject[]) => CreatorObject[],
    recordHistory = true,
  ): void {
    if (recordHistory) this.pushUndo();
    this.level = {
      ...this.level,
      objects: updater(this.level.objects).sort((a, b) => a.timeSec - b.timeSec),
    };
  }

  public mutateLevel(
    updater: (doc: BeatflowLevelDocument) => BeatflowLevelDocument,
    recordHistory = true,
  ): void {
    if (recordHistory) this.pushUndo();
    this.level = updater(this.level);
  }

  /**
   * 4-way movement for selected items (↑↓ time, ←→ lane).
   */
  public moveSelected(
    deltaLane: number,
    deltaTimeSec: number,
    recordHistory = true,
  ): boolean {
    if (this.selectedIds.size === 0) return false;
    const laneCount = this.level.gameplayRules.laneCount;
    let movedAny = false;

    this.mutateObjects(
      (objs) =>
        objs.map((o) => {
          if (!this.selectedIds.has(o.id) || GroupManager.isObjectLocked(o, this.level.groups)) {
            return o;
          }
          const rawNextTime = Math.max(0, o.timeSec + deltaTimeSec);
          const nextTime =
            deltaTimeSec !== 0 ? this.snapTime(rawNextTime) : o.timeSec;
          const isLaneBound = o.lane >= 0 && !o.trigger;
          const nextLane = isLaneBound
            ? Math.max(0, Math.min(laneCount - 1, o.lane + deltaLane))
            : o.lane;
          const nextX =
            isLaneBound && nextLane !== o.lane
              ? Number(((nextLane - (laneCount - 1) / 2) * 1.45).toFixed(2))
              : o.position.x;

          if (nextTime !== o.timeSec || nextLane !== o.lane) {
            movedAny = true;
          }

          return {
            ...o,
            timeSec: nextTime,
            lane: nextLane,
            position: { ...o.position, x: nextX },
            noteData: o.noteData
              ? {
                  ...o.noteData,
                  lane: isLaneBound ? nextLane : o.noteData.lane,
                }
              : undefined,
          };
        }),
      recordHistory,
    );
    return movedAny;
  }

  public resizeLongNote(
    objectId: string,
    nextDurationSec: number,
    recordHistory = true,
  ): boolean {
    const target = this.level.objects.find((o) => o.id === objectId);
    if (!target || !target.noteData) return false;
    if (GroupManager.isObjectLocked(target, this.level.groups)) return false;

    const minDur = Math.max(0.1, Math.min(0.25, this.getSnapStepSec()));
    const step = this.snapDivision === 'free' ? 0.05 : this.getSnapStepSec();
    const snappedDur =
      step > 0
        ? Math.max(minDur, Number((Math.round(nextDurationSec / step) * step).toFixed(3)))
        : Math.max(0.1, Number(nextDurationSec.toFixed(3)));
    const clamped = Math.min(16, snappedDur);

    this.mutateObjects(
      (objs) =>
        objs.map((o) => {
          if (o.id !== objectId || !o.noteData) return o;
          const isHold = o.type === 'note_hold' || o.type === 'note_slide';
          return {
            ...o,
            type: isHold ? o.type : 'note_hold',
            noteData: {
              ...o.noteData,
              kind: o.noteData.kind === 'slide' ? 'slide' : 'hold',
              casillaShape: 'long',
              durationSec: clamped,
            },
          };
        }),
      recordHistory,
    );
    return true;
  }

  public batchUpdateMaterial(
    patch: Partial<CreatorMaterialSpec>,
    recordHistory = true,
  ): void {
    if (this.selectedIds.size === 0) return;
    this.mutateObjects(
      (objs) =>
        objs.map((o) => {
          if (!this.selectedIds.has(o.id) || GroupManager.isObjectLocked(o, this.level.groups)) {
            return o;
          }
          const nextColor = patch.color ?? o.material.color;
          return {
            ...o,
            material: {
              ...o.material,
              ...patch,
              emissive: patch.emissive ?? nextColor,
            },
          };
        }),
      recordHistory,
    );
  }

  public updateObjectTrigger(
    objectId: string,
    trigger: TriggerConfigPayload,
    recordHistory = true,
  ): void {
    this.mutateObjects(
      (objs) =>
        objs.map((o) => {
          if (o.id !== objectId || GroupManager.isObjectLocked(o, this.level.groups)) return o;
          return {
            ...o,
            material: {
              ...o.material,
              color:
                'color' in trigger.params && typeof trigger.params.color === 'string'
                  ? trigger.params.color
                  : 'pulseColor' in trigger.params && typeof trigger.params.pulseColor === 'string'
                    ? trigger.params.pulseColor
                    : 'primaryColor' in trigger.params &&
                        typeof trigger.params.primaryColor === 'string'
                      ? trigger.params.primaryColor
                      : o.material.color,
            },
            trigger,
          };
        }),
      recordHistory,
    );
  }

  public deleteSelected(): number {
    if (this.selectedIds.size === 0) return 0;
    const removable = new Set<string>();
    for (const obj of this.level.objects) {
      if (this.selectedIds.has(obj.id) && !GroupManager.isObjectLocked(obj, this.level.groups)) {
        removable.add(obj.id);
      }
    }
    if (removable.size === 0) return 0;
    this.pushUndo();
    this.level = {
      ...this.level,
      objects: this.level.objects.filter((o) => !removable.has(o.id)),
    };
    for (const id of removable) this.selectedIds.delete(id);
    return removable.size;
  }

  public copySelected(): number {
    const items = this.level.objects.filter((o) => this.selectedIds.has(o.id));
    this.clipboard = items.map((o) => structuredClone(o));
    return this.clipboard.length;
  }

  public cutSelected(): number {
    const count = this.copySelected();
    if (count > 0) this.deleteSelected();
    return count;
  }

  public pasteAtTime(targetTimeSec: number): CreatorObject[] {
    if (this.clipboard.length === 0) return [];
    this.pushUndo();
    const minT = Math.min(...this.clipboard.map((c) => c.timeSec));
    const delta = this.snapTime(targetTimeSec) - minT;
    const pasted: CreatorObject[] = this.clipboard.map((item) => ({
      ...structuredClone(item),
      id: generateCreatorObjectId(item.category.slice(0, 3)),
      timeSec: Math.max(0, Number((item.timeSec + delta).toFixed(3))),
    }));
    this.level = {
      ...this.level,
      objects: [...this.level.objects, ...pasted].sort((a, b) => a.timeSec - b.timeSec),
    };
    this.selectedIds = new Set(pasted.map((p) => p.id));
    return pasted;
  }

  public duplicateSelected(beatOffset = 1): CreatorObject[] {
    if (this.selectedIds.size === 0) return [];
    this.pushUndo();
    const beatDur = 60 / Math.max(40, this.level.audio.bpm);
    const { created, all } = duplicateObjectsSequence(
      this.level.objects,
      this.selectedIds,
      beatDur * beatOffset,
    );
    this.level = { ...this.level, objects: all };
    this.selectedIds = new Set(created.map((c) => c.id));
    return created;
  }

  /**
   * Repeat Pattern (PDF 2 requirement): repeats selected pattern N times preserving
   * internal spacing, colors, shapes, durations, and trigger parameters.
   */
  public repeatSelectedPattern(repeatCount = 1, gapBeats = 1): CreatorObject[] {
    if (this.selectedIds.size === 0 || repeatCount <= 0) return [];
    const selected = this.level.objects
      .filter((o) => this.selectedIds.has(o.id))
      .sort((a, b) => a.timeSec - b.timeSec);
    if (selected.length === 0) return [];

    this.pushUndo();
    const minTime = selected[0].timeSec;
    const maxEndTime = Math.max(
      ...selected.map((o) => o.timeSec + (o.noteData?.durationSec ?? 0)),
    );
    const beatDur = 60 / Math.max(40, this.level.audio.bpm);
    const span = Math.max(beatDur * 0.5, maxEndTime - minTime);
    const stepStride = span + beatDur * Math.max(0, gapBeats);

    const created: CreatorObject[] = [];
    for (let r = 1; r <= repeatCount; r++) {
      const offset = stepStride * r;
      for (const item of selected) {
        created.push({
          ...structuredClone(item),
          id: generateCreatorObjectId(item.category.slice(0, 3)),
          timeSec: Math.max(0, Number((item.timeSec + offset).toFixed(3))),
        });
      }
    }

    const maxNewTime = Math.max(
      ...created.map((o) => o.timeSec + (o.noteData?.durationSec ?? 0)),
    );
    const neededDuration = Math.max(
      this.level.audio.durationSec,
      Math.ceil(maxNewTime + 4),
    );

    this.level = {
      ...this.level,
      audio:
        neededDuration > this.level.audio.durationSec
          ? { ...this.level.audio, durationSec: neededDuration }
          : this.level.audio,
      objects: [...this.level.objects, ...created].sort((a, b) => a.timeSec - b.timeSec),
    };
    this.selectedIds = new Set(created.map((c) => c.id));
    return created;
  }

  public alignSelected(mode: 'snap_beat' | 'center_x' | 'same_time' | 'mirror_x'): void {
    if (this.selectedIds.size === 0) return;
    const selected = this.level.objects.filter((o) => this.selectedIds.has(o.id));
    if (selected.length === 0) return;
    const avgTime = selected[0].timeSec;
    this.mutateObjects((objs) =>
      objs.map((o) => {
        if (!this.selectedIds.has(o.id) || GroupManager.isObjectLocked(o, this.level.groups)) {
          return o;
        }
        if (mode === 'snap_beat') {
          return { ...o, timeSec: this.snapTime(o.timeSec) };
        }
        if (mode === 'center_x') {
          return { ...o, position: { ...o.position, x: 0 } };
        }
        if (mode === 'mirror_x') {
          const laneCount = this.level.gameplayRules.laneCount;
          const nextLane = o.lane >= 0 ? laneCount - 1 - o.lane : -1;
          return {
            ...o,
            lane: nextLane,
            position: { ...o.position, x: Number((-o.position.x).toFixed(2)) },
            noteData: o.noteData ? { ...o.noteData, lane: Math.max(0, nextLane) } : undefined,
          };
        }
        return { ...o, timeSec: avgTime };
      }),
    );
  }

  public createGroup(name?: string, assignSelected = true): number {
    this.pushUndo();
    const { groups, created } = GroupManager.createGroup(this.level.groups, name);
    const objects = assignSelected
      ? GroupManager.assignGroupToObjects(this.level.objects, this.selectedIds, created.id)
      : this.level.objects;
    this.level = { ...this.level, groups, objects };
    return created.id;
  }

  public ungroupSelected(): void {
    if (this.selectedIds.size === 0) return;
    this.pushUndo();
    this.level = {
      ...this.level,
      objects: this.level.objects.map((o) =>
        this.selectedIds.has(o.id) ? { ...o, groupIds: [1] } : o,
      ),
    };
  }

  public assignGroupToSelected(groupId: number): void {
    if (this.selectedIds.size === 0) return;
    this.pushUndo();
    this.level = {
      ...this.level,
      objects: GroupManager.assignGroupToObjects(this.level.objects, this.selectedIds, groupId),
    };
  }

  public removeGroupFromSelected(groupId: number): void {
    if (this.selectedIds.size === 0) return;
    this.pushUndo();
    this.level = {
      ...this.level,
      objects: GroupManager.removeGroupFromObjects(this.level.objects, this.selectedIds, groupId),
    };
  }

  public mergeGroups(sourceGroupId: number, targetGroupId: number): void {
    this.pushUndo();
    const { groups, objects } = GroupManager.mergeGroups(
      this.level.groups,
      this.level.objects,
      sourceGroupId,
      targetGroupId,
    );
    this.level = { ...this.level, groups, objects };
  }

  public toggleGroupProp(groupId: number, prop: 'locked' | 'visible' | 'active'): void {
    this.pushUndo();
    this.level = {
      ...this.level,
      groups: this.level.groups.map((g) => (g.id === groupId ? { ...g, [prop]: !g[prop] } : g)),
    };
  }

  public addMarker(marker: TimelineMarker): void {
    this.pushUndo();
    this.level = {
      ...this.level,
      markers: [...this.level.markers, marker].sort((a, b) => a.timeSec - b.timeSec),
    };
  }

  public removeMarker(markerId: string): void {
    this.pushUndo();
    this.level = {
      ...this.level,
      markers: this.level.markers.filter((m) => m.id !== markerId),
    };
  }

  public addKeyframe(kf: TimelineKeyframe): void {
    this.pushUndo();
    this.level = {
      ...this.level,
      timelineKeyframes: [...this.level.timelineKeyframes, kf].sort(
        (a, b) => a.timeSec - b.timeSec,
      ),
    };
  }

  public removeKeyframe(kfId: string): void {
    this.pushUndo();
    this.level = {
      ...this.level,
      timelineKeyframes: this.level.timelineKeyframes.filter((k) => k.id !== kfId),
    };
  }

  /**
   * Optional Auto-Pattern Assistant: generates editable Casilla objects from a MusicProfile.
   */
  public applyAutoPatternFromMusicProfile(
    profile: MusicProfile,
    options: { difficulty: DifficultyLevel; laneCount: LaneCount; replaceExistingNotes: boolean },
  ): number {
    this.pushUndo();
    const cfg = getPresetGenerationConfig(
      options.difficulty,
      `creator-${Date.now().toString(36)}`,
      options.laneCount,
      this.level.gameplayRules.maxMisses,
    );
    const generated = generateProceduralLevel(profile, cfg);

    const squareItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_square')!;
    const longItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_long')!;
    const flickItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_flick')!;
    const slideItem = CREATOR_BUILD_ITEMS.find((i) => i.id === 'casilla_slide')!;

    const createdNotes: CreatorObject[] = generated.notes.map((n) => {
      const item =
        n.kind === 'hold'
          ? longItem
          : n.kind === 'flick'
            ? flickItem
            : n.kind === 'slide'
              ? slideItem
              : squareItem;
      const obj = createObjectFromBuildItem(item, {
        timeSec: n.time,
        lane: n.lane,
        laneCount: options.laneCount,
        primaryPaletteColor: this.level.audio.palette.primary,
        secondaryPaletteColor: this.level.audio.palette.secondary,
      });
      if (obj.noteData) {
        obj.noteData.durationSec = n.durationSec ?? 0;
        obj.noteData.flickDirection = n.flickDir;
        obj.noteData.slideTargetLane =
          n.slidePath && n.slidePath.length > 0
            ? n.slidePath[n.slidePath.length - 1].lane
            : undefined;
      }
      return obj;
    });

    const sectionMarkers: TimelineMarker[] = (profile.sections ?? []).map((sec, idx) => ({
      id: `sec-${idx}-${sec.type}`,
      timeSec: Number(sec.start.toFixed(2)),
      label: sec.type.toUpperCase(),
      color: sec.type === 'drop' ? '#ec4899' : sec.type === 'chorus' ? '#fbbf24' : '#22d3ee',
      kind: sec.type === 'drop' ? 'drop' : 'section',
    }));

    const keptObjects = options.replaceExistingNotes
      ? this.level.objects.filter(
          (o) =>
            o.type !== 'note_tap' &&
            o.type !== 'note_hold' &&
            o.type !== 'note_flick' &&
            o.type !== 'note_slide',
        )
      : this.level.objects;

    this.level = {
      ...this.level,
      audio: {
        ...this.level.audio,
        bpm: Math.round(profile.bpm || this.level.audio.bpm),
        durationSec: profile.duration || this.level.audio.durationSec,
      },
      gameplayRules: {
        ...this.level.gameplayRules,
        laneCount: options.laneCount,
      },
      objects: [...keptObjects, ...createdNotes].sort((a, b) => a.timeSec - b.timeSec),
      markers: sectionMarkers.length > 0 ? sectionMarkers : this.level.markers,
    };
    return createdNotes.length;
  }
}
