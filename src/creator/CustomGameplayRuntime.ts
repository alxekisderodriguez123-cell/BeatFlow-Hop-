import type { FlickDirection, HitJudgment, MusicalSectionType } from '../types/game';
import type {
  BeatflowLevelDocument,
  CreatorObject,
  CustomGameplayMode,
  CustomGameplayRules,
} from '../types/creator';

export interface CustomRuntimeNoteState {
  objectId: string;
  obj: CreatorObject;
  resolved: boolean;
  holding: boolean;
  missed: boolean;
  hitJudgment?: HitJudgment;
  holdProgress: number;
}

export interface CustomRuntimeStats {
  mode: CustomGameplayMode;
  score: number;
  combo: number;
  maxCombo: number;
  hits: number;
  misses: number;
  maxMisses: number;
  accuracy: number;
  feverActive: boolean;
  feverCharge: number;
  currentSpeedMult: number;
  lastJudgment: { judgment: HitJudgment; label: string; lane: number; id: number } | null;
  defeated: boolean;
  completed: boolean;
  survivalElapsedSec: number;
}

export interface CustomRuntimeCallbacks {
  onEmitEvent?: (eventId: string) => void;
  onVariableAdd?: (varName: string, delta: number) => void;
}

export class CustomGameplayRuntime {
  private rules: CustomGameplayRules;
  private notes: CustomRuntimeNoteState[] = [];
  private activeHolds = new Map<number, CustomRuntimeNoteState>();
  private speedMult = 1.0;
  private appliedPortals = new Set<string>();
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private hits = 0;
  private misses = 0;
  private feverCharge = 0;
  private feverRemaining = 0;
  private judgmentSeq = 0;
  private lastJudgment: CustomRuntimeStats['lastJudgment'] = null;
  private defeated = false;
  private completed = false;
  private survivalElapsed = 0;
  private startTimeSec = 0;
  private callbacks: CustomRuntimeCallbacks;

  constructor(level: BeatflowLevelDocument, callbacks: CustomRuntimeCallbacks = {}) {
    this.rules = { ...level.gameplayRules };
    this.callbacks = callbacks;
    this.loadLevel(level, 0);
  }

  public loadLevel(level: BeatflowLevelDocument, startTimeSec = 0): void {
    this.rules = { ...level.gameplayRules };
    this.startTimeSec = startTimeSec;
    this.notes = level.objects
      .filter(
        (o) =>
          !o.hidden &&
          o.collisionEnabled &&
          (o.type === 'note_tap' ||
            o.type === 'note_hold' ||
            o.type === 'note_flick' ||
            o.type === 'note_slide' ||
            o.type === 'hit_zone' ||
            o.type === 'interactive_orb' ||
            o.type === 'obstacle' ||
            o.type === 'speed_portal'),
      )
      .map((obj) => ({
        objectId: obj.id,
        obj,
        resolved: obj.timeSec < startTimeSec - 0.15,
        holding: false,
        missed: false,
        holdProgress: 0,
      }));
    this.activeHolds.clear();
    this.appliedPortals.clear();
    this.speedMult = this.rules.approachSpeed || 1.0;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.hits = 0;
    this.misses = 0;
    this.feverCharge = 0;
    this.feverRemaining = 0;
    this.lastJudgment = null;
    this.defeated = false;
    this.completed = false;
    this.survivalElapsed = 0;
  }

  public getSpeedMultiplier(): number {
    return this.speedMult;
  }

  public getNoteStates(): CustomRuntimeNoteState[] {
    return this.notes;
  }

  private getWindowSec(): number {
    const baseMs =
      this.rules.mode === 'precision_timing'
        ? Math.min(85, this.rules.hitWindowMs)
        : this.rules.hitWindowMs;
    return Math.max(0.055, Math.min(0.24, baseMs / 1000));
  }

  private registerHit(
    item: CustomRuntimeNoteState,
    deltaSec: number,
    customLabel?: string,
  ): void {
    const absD = Math.abs(deltaSec);
    const w = this.getWindowSec();
    const judgment: HitJudgment =
      absD <= w * 0.38 ? 'perfect' : absD <= w * 0.72 ? 'good' : 'ok';

    item.resolved = true;
    item.hitJudgment = judgment;
    this.hits++;
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    if (this.rules.enableFever) {
      if (this.feverRemaining > 0) {
        this.feverRemaining = Math.min(8, this.feverRemaining + 0.15);
      } else {
        this.feverCharge = Math.min(1, this.feverCharge + (judgment === 'perfect' ? 0.12 : 0.08));
        if (this.feverCharge >= 1) {
          this.feverCharge = 0;
          this.feverRemaining = 7.5;
        }
      }
    }

    const feverMult = this.feverRemaining > 0 ? 2 : 1;
    const basePts = item.obj.noteData?.points ?? this.rules.scorePerHit;
    const mult =
      (judgment === 'perfect' ? 1.25 : judgment === 'good' ? 1.0 : 0.75) *
      (1 + Math.min(2, this.combo * 0.02)) *
      feverMult;
    this.score += Math.round(basePts * mult);

    this.lastJudgment = {
      judgment,
      label: customLabel ?? judgment.toUpperCase(),
      lane: Math.max(0, item.obj.lane),
      id: ++this.judgmentSeq,
    };

    this.callbacks.onVariableAdd?.('hits', 1);
    if (item.obj.eventId) {
      this.callbacks.onEmitEvent?.(item.obj.eventId);
    }
  }

  private registerMiss(item: CustomRuntimeNoteState, label = 'MISS'): void {
    if (item.resolved || item.missed) return;
    item.missed = true;
    item.resolved = true;
    this.misses++;
    this.combo = 0;
    this.feverCharge = Math.max(0, this.feverCharge - 0.18);
    this.lastJudgment = {
      judgment: 'miss',
      label,
      lane: Math.max(0, item.obj.lane),
      id: ++this.judgmentSeq,
    };
    if (this.misses >= this.rules.maxMisses) {
      this.defeated = true;
    }
  }

  public step(
    currentTime: number,
    dt: number,
    durationSec: number,
    _section: MusicalSectionType,
    visualOnly: boolean,
  ): void {
    if (this.defeated || this.completed) return;

    this.survivalElapsed = Math.max(0, currentTime - this.startTimeSec);
    if (this.feverRemaining > 0) {
      this.feverRemaining = Math.max(0, this.feverRemaining - dt);
    }

    const windowSec = this.getWindowSec();

    for (const item of this.notes) {
      if (item.resolved) continue;

      if (item.obj.type === 'speed_portal') {
        if (currentTime >= item.obj.timeSec && !this.appliedPortals.has(item.objectId)) {
          this.appliedPortals.add(item.objectId);
          item.resolved = true;
          this.speedMult = Math.max(
            0.55,
            Math.min(2.3, item.obj.noteData?.speedMultiplier ?? 1.25),
          );
          if (item.obj.eventId) this.callbacks.onEmitEvent?.(item.obj.eventId);
        }
        continue;
      }

      if (item.obj.type === 'obstacle') {
        if (currentTime > item.obj.timeSec + windowSec) {
          item.resolved = true; // Dodged safely
        }
        continue;
      }

      if (item.holding) {
        const dur = Math.max(0.25, item.obj.noteData?.durationSec ?? 0.6);
        const endT = item.obj.timeSec + dur;
        item.holdProgress = Math.min(1, Math.max(0, (currentTime - item.obj.timeSec) / dur));
        if (currentTime >= endT) {
          item.holding = false;
          this.activeHolds.delete(Math.max(0, item.obj.lane));
          this.registerHit(item, 0, 'HOLD OK');
        }
        continue;
      }

      if (visualOnly) {
        if (currentTime >= item.obj.timeSec) {
          item.resolved = true;
        }
        continue;
      }

      if (currentTime > item.obj.timeSec + windowSec) {
        this.registerMiss(item, 'MISS');
      }
    }

    if (
      this.rules.mode === 'timed_survival' &&
      this.survivalElapsed >= this.rules.survivalTimeGoalSec &&
      !this.defeated
    ) {
      this.completed = true;
    } else if (currentTime >= Math.max(durationSec - 0.05, 1)) {
      this.completed = true;
    }
  }

  public handleLanePress(lane: number, currentTime: number): boolean {
    if (!this.rules.inputMapping.allowKeyboard && !this.rules.inputMapping.allowTouch) {
      return false;
    }
    const w = this.getWindowSec();

    // Check obstacle collision first if obstacles enabled
    if (this.rules.enableObstacles) {
      const hazard = this.notes.find(
        (n) =>
          !n.resolved &&
          n.obj.type === 'obstacle' &&
          n.obj.lane === lane &&
          Math.abs(n.obj.timeSec - currentTime) <= w * 0.8,
      );
      if (hazard) {
        this.registerMiss(hazard, 'IMPACTO');
        return false;
      }
    }

    const candidate = this.notes.find(
      (n) =>
        !n.resolved &&
        !n.holding &&
        n.obj.type !== 'obstacle' &&
        n.obj.type !== 'speed_portal' &&
        (n.obj.lane === lane || n.obj.lane < 0) &&
        Math.abs(n.obj.timeSec - currentTime) <= w,
    );

    if (!candidate) return false;

    if (candidate.obj.type === 'note_hold') {
      candidate.holding = true;
      this.activeHolds.set(lane, candidate);
      this.score += 45;
      return true;
    }

    this.registerHit(candidate, candidate.obj.timeSec - currentTime);
    return true;
  }

  public handleLaneRelease(lane: number, currentTime: number): void {
    const active = this.activeHolds.get(lane);
    if (!active) return;
    this.activeHolds.delete(lane);
    active.holding = false;
    const dur = Math.max(0.25, active.obj.noteData?.durationSec ?? 0.6);
    const endT = active.obj.timeSec + dur;
    if (currentTime >= endT - 0.16) {
      this.registerHit(active, 0, 'HOLD OK');
    } else {
      this.registerMiss(active, 'SOLTADO');
    }
  }

  public handleLaneFlick(lane: number, _dir: FlickDirection, currentTime: number): boolean {
    const w = this.getWindowSec() * 1.15;
    const cand = this.notes.find(
      (n) =>
        !n.resolved &&
        n.obj.type === 'note_flick' &&
        n.obj.lane === lane &&
        Math.abs(n.obj.timeSec - currentTime) <= w,
    );
    if (!cand) return false;
    this.registerHit(cand, cand.obj.timeSec - currentTime, 'FLICK');
    return true;
  }

  public handleLaneSlide(lane: number, currentTime: number): boolean {
    const active = Array.from(this.activeHolds.values()).find(
      (n) => n.obj.type === 'note_slide' && n.obj.noteData?.slideTargetLane === lane,
    );
    if (active) {
      this.registerHit(active, 0, 'SLIDE');
      return true;
    }
    const w = this.getWindowSec() * 1.15;
    const cand = this.notes.find(
      (n) =>
        !n.resolved &&
        n.obj.type === 'note_slide' &&
        (n.obj.lane === lane || n.obj.noteData?.slideTargetLane === lane) &&
        Math.abs(n.obj.timeSec - currentTime) <= w,
    );
    if (!cand) return false;
    this.registerHit(cand, cand.obj.timeSec - currentTime, 'SLIDE');
    return true;
  }

  /**
   * Free spatial Touch-Zone tap (`nx` in -1..1 across track width, `ny` normalized height)
   */
  public handleTouchZoneTap(nx: number, currentTime: number): boolean {
    if (!this.rules.enableTouchZones && !this.rules.inputMapping.allowMultiTouchZones) {
      return false;
    }
    const w = this.getWindowSec() * 1.25;
    const worldX = nx * 3.5;
    let best: CustomRuntimeNoteState | null = null;
    let bestDist = Infinity;

    for (const n of this.notes) {
      if (n.resolved || n.obj.type === 'obstacle' || n.obj.type === 'speed_portal') continue;
      if (Math.abs(n.obj.timeSec - currentTime) > w) continue;
      const dist = Math.abs(n.obj.position.x - worldX);
      if (dist < 1.55 && dist < bestDist) {
        best = n;
        bestDist = dist;
      }
    }

    if (!best) return false;
    this.registerHit(best, best.obj.timeSec - currentTime, 'ZONA HIT');
    return true;
  }

  public getStats(): CustomRuntimeStats {
    const attempted = this.hits + this.misses;
    return {
      mode: this.rules.mode,
      score: this.score,
      combo: this.combo,
      maxCombo: this.maxCombo,
      hits: this.hits,
      misses: this.misses,
      maxMisses: this.rules.maxMisses,
      accuracy: attempted > 0 ? (this.hits / attempted) * 100 : 100,
      feverActive: this.feverRemaining > 0,
      feverCharge: this.feverCharge,
      currentSpeedMult: this.speedMult,
      lastJudgment: this.lastJudgment,
      defeated: this.defeated,
      completed: this.completed,
      survivalElapsedSec: this.survivalElapsed,
    };
  }
}
