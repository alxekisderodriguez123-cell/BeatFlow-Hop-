import type { MusicalSectionType } from '../types/game';
import type {
  AudioTriggerParams,
  ColorTriggerParams,
  CreatorGroup,
  CreatorObject,
  EasingType,
  LogicTriggerParams,
  MoveTriggerParams,
  PulseTriggerParams,
  RotateTriggerParams,
  ScaleTriggerParams,
  SpawnTriggerParams,
  ToggleTriggerParams,
  TriggerConfigPayload,
} from '../types/creator';
import type { ReactiveLightingOutput } from '../game/MusicReactiveLighting';
import { blendHex } from '../services/chromaticEngine';
import { AnimationController, evaluateEasing } from './AnimationController';
import { CameraController } from './CameraController';
import { EffectController } from './EffectController';

export interface ActiveGroupAction {
  id: string;
  triggerType: TriggerConfigPayload['type'];
  targetGroupId: number;
  startTime: number;
  payload: TriggerConfigPayload;
}

export interface TriggerExecutionContext {
  currentTime: number;
  dt: number;
  bpm: number;
  section: MusicalSectionType;
  beatTriggered: boolean;
  onsetTriggered: boolean;
  lighting: ReactiveLightingOutput;
  inPlaytest: boolean;
}

export interface TriggerDebugLogEntry {
  id: string;
  name: string;
  type: TriggerConfigPayload['type'];
  timeSec: number;
  targetGroupId?: number;
  detail: string;
}

const MAX_SPAWN_DEPTH = 16;

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function compareValues(
  a: number,
  op: LogicTriggerParams['compareOp'],
  b: number,
): boolean {
  switch (op) {
    case '==':
      return Math.abs(a - b) < 1e-5;
    case '!=':
      return Math.abs(a - b) >= 1e-5;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
    case '<':
      return a < b;
    case '<=':
      return a <= b;
  }
}

/**
 * Deterministic, safe runtime evaluator for all 12 BeatFlow Creator Trigger types.
 * Zero arbitrary code execution or eval; all logic triggers evaluate enumerated opcodes.
 */
export class TriggerSystem {
  private firedTimelineIds = new Set<string>();
  private firedOnceIds = new Set<string>();
  private receivedEvents = new Set<string>();
  private audioCooldowns = new Map<string, number>();
  private logicTimers = new Map<string, number>();
  private variables: Record<string, number> = {};
  private activeActions: ActiveGroupAction[] = [];
  private persistentToggles = new Map<
    number,
    { active: boolean; collisionEnabled: boolean; renderingEnabled: boolean }
  >();
  private debugLog: TriggerDebugLogEntry[] = [];
  private lastDropState = false;
  private rngState = 133791;

  private nextDeterministicRandom(): number {
    this.rngState = (this.rngState * 1664525 + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  public reset(initialVars: Record<string, number> = {}): void {
    this.firedTimelineIds.clear();
    this.firedOnceIds.clear();
    this.receivedEvents.clear();
    this.audioCooldowns.clear();
    this.logicTimers.clear();
    this.activeActions = [];
    this.persistentToggles.clear();
    this.debugLog = [];
    this.lastDropState = false;
    this.rngState = 133791;
    this.variables = { ...initialVars };
  }

  public getVariables(): Record<string, number> {
    return { ...this.variables };
  }

  public setVariable(key: string, value: number): void {
    if (!key) return;
    this.variables[key] = Number.isFinite(value) ? value : 0;
  }

  public getDebugLog(): TriggerDebugLogEntry[] {
    return [...this.debugLog];
  }

  public getTriggeredCount(): number {
    return this.debugLog.length;
  }

  public getActiveGroupIds(): number[] {
    const ids = new Set<number>();
    for (const act of this.activeActions) {
      if (act.targetGroupId > 0) ids.add(act.targetGroupId);
    }
    return Array.from(ids).sort((a, b) => a - b);
  }

  private pushLog(entry: TriggerDebugLogEntry): void {
    this.debugLog.unshift(entry);
    if (this.debugLog.length > 40) {
      this.debugLog.length = 40;
    }
  }

  public emitEvent(
    eventId: string,
    objects: CreatorObject[],
    ctx: TriggerExecutionContext,
    cameraCtrl: CameraController,
    effectCtrl: EffectController,
    visited = new Set<string>(),
    depth = 0,
  ): void {
    if (!eventId || depth >= MAX_SPAWN_DEPTH || visited.has(eventId)) return;
    visited.add(eventId);
    this.receivedEvents.add(eventId);

    for (const obj of objects) {
      if (obj.hidden || !obj.trigger || obj.eventId !== eventId) continue;
      this.executeTriggerObject(obj, objects, ctx, cameraCtrl, effectCtrl, visited, depth + 1);
    }
  }

  public step(
    objects: CreatorObject[],
    groups: CreatorGroup[],
    ctx: TriggerExecutionContext,
    animCtrl: AnimationController,
    cameraCtrl: CameraController,
    effectCtrl: EffectController,
  ): void {
    const dropRising = ctx.section === 'drop' && !this.lastDropState;
    this.lastDropState = ctx.section === 'drop';

    // 1. Fire timeline triggers when playback crosses their timeSec
    for (const obj of objects) {
      if (obj.hidden || !obj.trigger) continue;

      if (obj.trigger.type === 'audio') {
        this.evaluateAudioTrigger(obj, obj.trigger.params, objects, ctx, cameraCtrl, effectCtrl);
        continue;
      }

      if (obj.trigger.type === 'logic' && obj.trigger.params.op === 'TIMER') {
        this.evaluateTimerLogic(obj, obj.trigger.params, objects, ctx, cameraCtrl, effectCtrl);
      }

      // Event-only triggers (waiting for Spawn/Orb/Logic) don't auto-fire at timeline unless eventId is empty
      if (obj.eventId && obj.eventId.trim().length > 0) continue;

      if (ctx.currentTime >= obj.timeSec && !this.firedTimelineIds.has(obj.id)) {
        this.firedTimelineIds.add(obj.id);
        this.executeTriggerObject(obj, objects, ctx, cameraCtrl, effectCtrl, new Set(), 0);
      }
    }

    // 2. Apply persistent toggle states
    for (const grp of groups) {
      const st = animCtrl.getOrCreateGroupState(grp.id);
      const tog = this.persistentToggles.get(grp.id);
      if (tog) {
        st.active = tog.active;
        st.visible = tog.renderingEnabled && grp.visible;
        st.collisionEnabled = tog.collisionEnabled;
      } else {
        st.active = grp.active;
        st.visible = grp.visible;
        st.collisionEnabled = true;
      }
    }

    // 3. Evaluate active timed group animations (Color, Alpha, Pulse, Move, Rotate, Scale)
    for (let i = this.activeActions.length - 1; i >= 0; i--) {
      const act = this.activeActions[i];
      if (ctx.currentTime < act.startTime) continue;

      const keep = this.applyActionToGroup(act, ctx, animCtrl, dropRising);
      if (!keep) {
        this.activeActions.splice(i, 1);
      }
    }
  }

  private evaluateAudioTrigger(
    obj: CreatorObject,
    p: AudioTriggerParams,
    objects: CreatorObject[],
    ctx: TriggerExecutionContext,
    cameraCtrl: CameraController,
    effectCtrl: EffectController,
  ): void {
    const lastFired = this.audioCooldowns.get(obj.id) ?? -999;
    if (ctx.currentTime - lastFired < Math.max(0.05, p.cooldownSec)) return;

    let hit = false;
    let level = 0;
    switch (p.eventKind) {
      case 'kick':
        level = ctx.lighting.kickPulse;
        hit = level >= p.threshold;
        break;
      case 'snare':
        level = ctx.lighting.snarePulse;
        hit = level >= p.threshold;
        break;
      case 'bass':
        level = ctx.lighting.bassLevel;
        hit = level >= p.threshold;
        break;
      case 'drop':
        hit = ctx.section === 'drop' && !this.lastDropState;
        level = 1;
        break;
      case 'section':
        hit = p.sectionTarget ? ctx.section === p.sectionTarget : false;
        level = 1;
        break;
      case 'beat':
        hit = ctx.beatTriggered;
        level = 0.85;
        break;
      case 'onset':
        hit = ctx.onsetTriggered;
        level = 0.85;
        break;
      case 'bpm':
        hit = p.minBpm ? ctx.bpm >= p.minBpm : ctx.beatTriggered;
        level = ctx.beatTriggered ? 1 : 0;
        break;
      case 'time':
        hit = ctx.currentTime >= obj.timeSec && !this.firedTimelineIds.has(obj.id);
        if (hit) this.firedTimelineIds.add(obj.id);
        level = 1;
        break;
    }

    if (!hit) return;
    this.audioCooldowns.set(obj.id, ctx.currentTime);

    // Emit quick pulse on target group + optionally spawn linked eventId
    if (p.targetGroupId > 0) {
      this.enqueueAction({
        id: `audio-pulse-${obj.id}-${ctx.currentTime.toFixed(3)}`,
        triggerType: 'pulse',
        targetGroupId: p.targetGroupId,
        startTime: ctx.currentTime,
        payload: {
          type: 'pulse',
          params: {
            targetGroupId: p.targetGroupId,
            pulseColor: obj.material.color || '#22d3ee',
            intensity: clamp(0.6 + level * 0.9, 0.2, 2.0),
            fadeIn: 0.03,
            hold: 0.06,
            fadeOut: 0.2,
            frequency: 1,
            repeatCount: 1,
            blendMode: 'additive',
            exclusive: false,
            syncWithMusic: true,
          },
        },
      });
    }

    this.pushLog({
      id: `${obj.id}-${ctx.currentTime.toFixed(3)}`,
      name: obj.name,
      type: 'audio',
      timeSec: ctx.currentTime,
      targetGroupId: p.targetGroupId,
      detail: `Audio (${p.eventKind})`,
    });

    if (p.spawnEventId) {
      this.emitEvent(p.spawnEventId, objects, ctx, cameraCtrl, effectCtrl, new Set(), 0);
    }
  }

  private evaluateTimerLogic(
    obj: CreatorObject,
    p: LogicTriggerParams,
    objects: CreatorObject[],
    ctx: TriggerExecutionContext,
    cameraCtrl: CameraController,
    effectCtrl: EffectController,
  ): void {
    const interval = Math.max(0.1, p.timerIntervalSec || 1.0);
    const prev = this.logicTimers.get(obj.id) ?? obj.timeSec;
    if (ctx.currentTime >= prev + interval) {
      this.logicTimers.set(obj.id, ctx.currentTime);
      this.executeLogicTrigger(obj, p, objects, ctx, cameraCtrl, effectCtrl, new Set(), 0);
    }
  }

  private executeTriggerObject(
    obj: CreatorObject,
    objects: CreatorObject[],
    ctx: TriggerExecutionContext,
    cameraCtrl: CameraController,
    effectCtrl: EffectController,
    visited: Set<string>,
    depth: number,
  ): void {
    const trig = obj.trigger;
    if (!trig) return;

    switch (trig.type) {
      case 'color':
      case 'alpha':
      case 'pulse':
      case 'move':
      case 'rotate':
      case 'scale': {
        const targetGroupId = trig.params.targetGroupId;
        const delay = 'delay' in trig.params ? Math.max(0, trig.params.delay) : 0;
        const exclusive = 'exclusive' in trig.params ? trig.params.exclusive : false;
        if (exclusive) {
          this.activeActions = this.activeActions.filter(
            (a) => !(a.targetGroupId === targetGroupId && a.triggerType === trig.type),
          );
        }
        this.enqueueAction({
          id: `${obj.id}-${depth}`,
          triggerType: trig.type,
          targetGroupId,
          startTime: ctx.currentTime + delay,
          payload: trig,
        });
        this.pushLog({
          id: `${obj.id}-${ctx.currentTime.toFixed(2)}`,
          name: obj.name,
          type: trig.type,
          timeSec: ctx.currentTime,
          targetGroupId,
          detail: `${trig.type.toUpperCase()} -> G${targetGroupId}`,
        });
        break;
      }

      case 'toggle': {
        const tp: ToggleTriggerParams = trig.params;
        const applyAt = ctx.currentTime + Math.max(0, tp.delay);
        if (tp.immediate || tp.delay <= 0.01) {
          this.persistentToggles.set(tp.targetGroupId, {
            active: tp.activate,
            collisionEnabled: tp.collisionEnabled,
            renderingEnabled: tp.renderingEnabled,
          });
        } else {
          this.enqueueAction({
            id: `${obj.id}-toggle`,
            triggerType: 'toggle',
            targetGroupId: tp.targetGroupId,
            startTime: applyAt,
            payload: trig,
          });
        }
        this.pushLog({
          id: `${obj.id}-${ctx.currentTime.toFixed(2)}`,
          name: obj.name,
          type: 'toggle',
          timeSec: ctx.currentTime,
          targetGroupId: tp.targetGroupId,
          detail: `G${tp.targetGroupId} ${tp.activate ? 'ON' : 'OFF'}`,
        });
        break;
      }

      case 'spawn': {
        const sp: SpawnTriggerParams = trig.params;
        if (ctx.inPlaytest && sp.previewDisabled) break;
        if (sp.triggerOnce && this.firedOnceIds.has(obj.id)) break;
        if (sp.conditionVar) {
          const curVal = this.variables[sp.conditionVar] ?? 0;
          if (curVal < (sp.conditionMinValue ?? 1)) break;
        }
        if (sp.triggerOnce) this.firedOnceIds.add(obj.id);
        this.pushLog({
          id: `${obj.id}-${ctx.currentTime.toFixed(2)}`,
          name: obj.name,
          type: 'spawn',
          timeSec: ctx.currentTime,
          detail: `Spawn -> ${sp.targetEventId}`,
        });
        this.emitEvent(
          sp.targetEventId,
          objects,
          ctx,
          cameraCtrl,
          effectCtrl,
          visited,
          depth + 1,
        );
        break;
      }

      case 'camera': {
        cameraCtrl.trigger(obj.id, ctx.currentTime, trig.params);
        this.pushLog({
          id: `${obj.id}-${ctx.currentTime.toFixed(2)}`,
          name: obj.name,
          type: 'camera',
          timeSec: ctx.currentTime,
          detail: `Camera: ${trig.params.action}`,
        });
        break;
      }

      case 'screen_fx': {
        effectCtrl.trigger(obj.id, ctx.currentTime, trig.params);
        this.pushLog({
          id: `${obj.id}-${ctx.currentTime.toFixed(2)}`,
          name: obj.name,
          type: 'screen_fx',
          timeSec: ctx.currentTime,
          detail: `FX: ${trig.params.effect}`,
        });
        break;
      }

      case 'logic': {
        this.executeLogicTrigger(
          obj,
          trig.params,
          objects,
          ctx,
          cameraCtrl,
          effectCtrl,
          visited,
          depth,
        );
        break;
      }

      case 'audio':
        break;
    }
  }

  private executeLogicTrigger(
    obj: CreatorObject,
    p: LogicTriggerParams,
    objects: CreatorObject[],
    ctx: TriggerExecutionContext,
    cameraCtrl: CameraController,
    effectCtrl: EffectController,
    visited: Set<string>,
    depth: number,
  ): void {
    const valA = this.variables[p.variableA] ?? 0;
    const valB = p.variableB ? (this.variables[p.variableB] ?? 0) : p.compareValue;
    let passed = false;

    switch (p.op) {
      case 'COUNTER': {
        const nextVal = valA + (p.incrementBy ?? 1);
        this.variables[p.variableA] = nextVal;
        passed = compareValues(nextVal, p.compareOp, p.compareValue);
        break;
      }
      case 'COMPARE':
        passed = compareValues(valA, p.compareOp, valB);
        break;
      case 'AND':
        passed = valA > 0 && valB > 0;
        break;
      case 'OR':
        passed = valA > 0 || valB > 0;
        break;
      case 'NOT':
        passed = valA <= 0;
        break;
      case 'RANDOM':
        passed = this.nextDeterministicRandom() <= clamp(p.randomChance, 0, 1);
        break;
      case 'TIMER':
        passed = true;
        break;
      case 'EVENT_RECEIVED':
        passed = this.receivedEvents.has(p.eventName);
        break;
      case 'TRIGGER_ONCE':
        if (!this.firedOnceIds.has(obj.id)) {
          this.firedOnceIds.add(obj.id);
          passed = true;
        }
        break;
    }

    this.pushLog({
      id: `${obj.id}-${ctx.currentTime.toFixed(2)}`,
      name: obj.name,
      type: 'logic',
      timeSec: ctx.currentTime,
      targetGroupId: p.targetGroupId,
      detail: `${p.op}: ${passed ? 'TRUE' : 'FALSE'}`,
    });

    const nextEvent = passed ? p.outputTrueEventId : p.outputFalseEventId;
    if (nextEvent) {
      this.emitEvent(nextEvent, objects, ctx, cameraCtrl, effectCtrl, visited, depth + 1);
    }
  }

  private enqueueAction(action: ActiveGroupAction): void {
    this.activeActions.push(action);
    if (this.activeActions.length > 96) {
      this.activeActions.shift();
    }
  }

  private applyActionToGroup(
    act: ActiveGroupAction,
    ctx: TriggerExecutionContext,
    animCtrl: AnimationController,
    _dropRising: boolean,
  ): boolean {
    const st = animCtrl.getOrCreateGroupState(act.targetGroupId);
    const elapsed = Math.max(0, ctx.currentTime - act.startTime);

    switch (act.payload.type) {
      case 'toggle': {
        const tp = act.payload.params;
        this.persistentToggles.set(tp.targetGroupId, {
          active: tp.activate,
          collisionEnabled: tp.collisionEnabled,
          renderingEnabled: tp.renderingEnabled,
        });
        st.active = tp.activate;
        st.visible = tp.renderingEnabled;
        st.collisionEnabled = tp.collisionEnabled;
        return false;
      }

      case 'color': {
        const p: ColorTriggerParams = act.payload.params;
        const total = Math.max(0.05, p.fadeIn + p.holdDuration + p.fadeOut);
        if (elapsed > total) return false;

        let w = 1;
        if (p.fadeIn > 0 && elapsed < p.fadeIn) {
          w = evaluateEasing(elapsed / p.fadeIn, p.easing);
        } else if (p.fadeOut > 0 && elapsed > p.fadeIn + p.holdDuration) {
          const outT = (elapsed - p.fadeIn - p.holdDuration) / p.fadeOut;
          w = 1 - evaluateEasing(outT, p.easing);
        }

        if (p.interpolate) {
          st.colorOverride = p.color;
          st.colorWeight = clamp(w, 0, 1);
        } else {
          st.colorOverride = p.color;
          st.colorWeight = 1;
        }
        st.opacityMult *= 1 + (p.opacity - 1) * w;
        st.emissionBoost *= 1 + (p.emission - 1) * w;
        st.glowBoost *= 1 + (p.glowIntensity - 1) * w;
        st.blendMode = p.blendMode;
        return true;
      }

      case 'alpha': {
        const p = act.payload.params;
        const dur = Math.max(0.02, p.fadeDuration);
        const t = clamp(elapsed / dur, 0, 1);
        const e = evaluateEasing(t, p.easing);
        st.opacityMult *= p.startValue + (p.endValue - p.startValue) * e;
        return t < 1;
      }

      case 'pulse': {
        const p: PulseTriggerParams = act.payload.params;
        const cycleDur = Math.max(0.06, p.fadeIn + p.hold + p.fadeOut);
        const repeats = Math.max(1, Math.round(p.repeatCount));
        const totalDur = cycleDur * repeats;
        if (elapsed > totalDur) return false;

        const localT = elapsed % cycleDur;
        let env = 1;
        if (p.fadeIn > 0 && localT < p.fadeIn) {
          env = localT / p.fadeIn;
        } else if (p.fadeOut > 0 && localT > p.fadeIn + p.hold) {
          env = Math.max(0, 1 - (localT - p.fadeIn - p.hold) / p.fadeOut);
        }
        const syncMult = p.syncWithMusic ? 0.8 + ctx.lighting.kickPulse * 0.45 : 1;
        const w = clamp(env * p.intensity * syncMult * 0.75, 0, 1);
        st.pulseColor = st.pulseColor ? blendHex(st.pulseColor, p.pulseColor, w) : p.pulseColor;
        st.pulseWeight = Math.max(st.pulseWeight, w);
        st.emissionBoost *= 1 + w * 0.5;
        st.blendMode = p.blendMode;
        return true;
      }

      case 'move': {
        const p: MoveTriggerParams = act.payload.params;
        const dur = Math.max(0.02, p.duration);
        const rawCycles = elapsed / dur;
        const maxCycles = p.loop ? Infinity : Math.max(1, p.repeat) * (p.reverse ? 2 : 1);
        if (rawCycles >= maxCycles) {
          if (!p.reverse) {
            if (p.axisLock !== 'x') st.offsetX += p.targetX;
            if (p.axisLock !== 'y') st.offsetY += p.targetY;
            if (p.axisLock !== 'z') st.offsetZ += p.targetZ;
            return true;
          }
          return false;
        }
        const cycleIdx = Math.floor(rawCycles);
        const localT = rawCycles - cycleIdx;
        const t = p.reverse && cycleIdx % 2 === 1 ? 1 - localT : localT;
        const e = evaluateEasing(t, p.easing as EasingType);

        if (p.axisLock !== 'x' && p.axisLock !== 'xy' && p.axisLock !== 'xz') {
          st.offsetX += p.targetX * e;
        }
        if (p.axisLock !== 'y' && p.axisLock !== 'xy') st.offsetY += p.targetY * e;
        if (p.axisLock !== 'z' && p.axisLock !== 'xz') st.offsetZ += p.targetZ * e;
        return true;
      }

      case 'rotate': {
        const p: RotateTriggerParams = act.payload.params;
        if (p.lockRotation) return true;
        if (p.continuous) {
          const cycles = elapsed / Math.max(0.05, p.duration);
          st.rotOffsetX += p.rotX * cycles;
          st.rotOffsetY += p.rotY * cycles;
          st.rotOffsetZ += p.rotZ * cycles;
          return true;
        }
        const dur = Math.max(0.02, p.duration);
        const total = dur * Math.max(1, p.repeat);
        const t = clamp(elapsed / dur, 0, 1);
        const e = evaluateEasing(t, p.easing);
        st.rotOffsetX += p.rotX * e;
        st.rotOffsetY += p.rotY * e;
        st.rotOffsetZ += p.rotZ * e;
        return elapsed < total + 0.05;
      }

      case 'scale': {
        const p: ScaleTriggerParams = act.payload.params;
        const dur = Math.max(0.02, p.duration);
        const rawT = clamp(elapsed / dur, 0, 1);
        let e = evaluateEasing(rawT, p.easing);
        if (p.restoreOriginal && elapsed > dur) {
          const backT = clamp((elapsed - dur) / dur, 0, 1);
          e = 1 - evaluateEasing(backT, p.easing);
          if (backT >= 1) return false;
        }
        const sx = 1 + (p.scaleX - 1) * e;
        const sy = p.uniformScale ? sx : 1 + (p.scaleY - 1) * e;
        const sz = p.uniformScale ? sx : 1 + (p.scaleZ - 1) * e;
        st.scaleMultX *= Math.max(0.08, sx);
        st.scaleMultY *= Math.max(0.08, sy);
        st.scaleMultZ *= Math.max(0.08, sz);
        return true;
      }

      default:
        return false;
    }
  }
}
