import type { BeatflowLevelDocument, CreatorObject } from '../types/creator';

export interface LevelValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  objectId?: string;
}

export interface LevelValidationReport {
  valid: boolean;
  errors: LevelValidationIssue[];
  warnings: LevelValidationIssue[];
}

function detectSpawnCycle(objects: CreatorObject[]): string | null {
  const adj = new Map<string, string[]>();
  for (const obj of objects) {
    if (!obj.trigger) continue;
    const src = obj.eventId?.trim();
    if (!src) continue;
    const list = adj.get(src) ?? [];
    if (obj.trigger.type === 'spawn' && obj.trigger.params.targetEventId) {
      list.push(obj.trigger.params.targetEventId);
    } else if (obj.trigger.type === 'logic') {
      if (obj.trigger.params.outputTrueEventId) list.push(obj.trigger.params.outputTrueEventId);
      if (obj.trigger.params.outputFalseEventId) list.push(obj.trigger.params.outputFalseEventId);
    } else if (obj.trigger.type === 'audio' && obj.trigger.params.spawnEventId) {
      list.push(obj.trigger.params.spawnEventId);
    }
    adj.set(src, list);
  }

  const state = new Map<string, number>(); // 0=unvisited, 1=visiting, 2=done
  const dfs = (node: string): string | null => {
    state.set(node, 1);
    for (const next of adj.get(node) ?? []) {
      const st = state.get(next) ?? 0;
      if (st === 1) return `${node} -> ${next}`;
      if (st === 0) {
        const res = dfs(next);
        if (res) return res;
      }
    }
    state.set(node, 2);
    return null;
  };

  for (const key of adj.keys()) {
    if ((state.get(key) ?? 0) === 0) {
      const cycle = dfs(key);
      if (cycle) return cycle;
    }
  }
  return null;
}

export function validateLevelDocument(
  level: BeatflowLevelDocument,
  options: { requireCommunityRights?: boolean } = {},
): LevelValidationReport {
  const issues: LevelValidationIssue[] = [];

  if (!level.levelName.trim()) {
    issues.push({
      severity: 'error',
      code: 'MISSING_NAME',
      message: 'El nivel debe tener un nombre válido.',
    });
  }

  if (level.audio.bpm < 40 || level.audio.bpm > 260) {
    issues.push({
      severity: 'error',
      code: 'INVALID_BPM',
      message: 'El BPM debe situarse entre 40 y 260.',
    });
  }

  const groupIds = new Set(level.groups.map((g) => g.id));
  const seenObjectIds = new Set<string>();
  let playableCount = 0;

  for (const obj of level.objects) {
    if (seenObjectIds.has(obj.id)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_OBJECT_ID',
        message: `ID de objeto duplicado: ${obj.id}`,
        objectId: obj.id,
      });
    }
    seenObjectIds.add(obj.id);

    if (obj.timeSec < 0 || !Number.isFinite(obj.timeSec)) {
      issues.push({
        severity: 'error',
        code: 'INVALID_TIME',
        message: `Tiempo inválido en "${obj.name}".`,
        objectId: obj.id,
      });
    }

    for (const gid of obj.groupIds) {
      if (!groupIds.has(gid)) {
        issues.push({
          severity: 'warning',
          code: 'ORPHAN_GROUP_REF',
          message: `"${obj.name}" referencia el Grupo G${gid} inexistente.`,
          objectId: obj.id,
        });
      }
    }

    if (
      obj.type === 'note_tap' ||
      obj.type === 'note_hold' ||
      obj.type === 'note_flick' ||
      obj.type === 'note_slide' ||
      obj.type === 'hit_zone' ||
      obj.type === 'interactive_orb'
    ) {
      playableCount++;
      if (obj.lane < 0 || obj.lane >= level.gameplayRules.laneCount) {
        issues.push({
          severity: 'warning',
          code: 'OUT_OF_RANGE_LANE',
          message: `La casilla "${obj.name}" está fuera del rango de carriles (0..${level.gameplayRules.laneCount - 1}).`,
          objectId: obj.id,
        });
      }
    }

    if (obj.trigger?.type === 'spawn' && !obj.trigger.params.targetEventId.trim()) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_SPAWN_TARGET',
        message: `El Trigger Spawn "${obj.name}" no tiene eventId de destino.`,
        objectId: obj.id,
      });
    }
  }

  if (playableCount === 0) {
    issues.push({
      severity: 'warning',
      code: 'NO_PLAYABLE_NOTES',
      message: 'El nivel aún no contiene casillas jugables.',
    });
  }

  const cycle = detectSpawnCycle(level.objects);
  if (cycle) {
    issues.push({
      severity: 'error',
      code: 'SPAWN_CYCLE_DETECTED',
      message: `Se detectó un bucle infinito entre triggers (${cycle}).`,
    });
  }

  if (options.requireCommunityRights) {
    const rights = level.audio.rights;
    if (!rights || !rights.licenseName.trim() || !rights.rightsHolder.trim()) {
      issues.push({
        severity: 'error',
        code: 'MISSING_AUDIO_RIGHTS',
        message: 'Publicar en la comunidad requiere declarar licencia y titular de derechos del audio.',
      });
    }
  }

  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
