import type {
  CreatorMaterialSpec,
  CreatorNoteData,
  CreatorObject,
  TriggerConfigPayload,
  Vec3Tuple,
} from '../types/creator';

export function patchObjectsByIds(
  objects: CreatorObject[],
  ids: Set<string>,
  updater: (obj: CreatorObject) => CreatorObject,
): CreatorObject[] {
  if (ids.size === 0) return objects;
  return objects.map((obj) => (ids.has(obj.id) ? updater(obj) : obj));
}

export function updateSelectedTransform(
  objects: CreatorObject[],
  ids: Set<string>,
  patch: {
    timeSec?: number;
    lane?: number;
    position?: Partial<Vec3Tuple>;
    rotation?: Partial<Vec3Tuple>;
    scale?: Partial<Vec3Tuple>;
    layer?: number;
    eventId?: string;
    name?: string;
    locked?: boolean;
    hidden?: boolean;
    collisionEnabled?: boolean;
  },
): CreatorObject[] {
  return patchObjectsByIds(objects, ids, (obj) => {
    const nextPos = patch.position ? { ...obj.position, ...patch.position } : obj.position;
    const nextRot = patch.rotation ? { ...obj.rotation, ...patch.rotation } : obj.rotation;
    const nextScale = patch.scale ? { ...obj.scale, ...patch.scale } : obj.scale;

    return {
      ...obj,
      name: patch.name !== undefined ? patch.name : obj.name,
      timeSec: patch.timeSec !== undefined ? Math.max(0, patch.timeSec) : obj.timeSec,
      lane: patch.lane !== undefined ? patch.lane : obj.lane,
      layer: patch.layer !== undefined ? Math.max(0, Math.min(7, patch.layer)) : obj.layer,
      eventId: patch.eventId !== undefined ? patch.eventId : obj.eventId,
      locked: patch.locked !== undefined ? patch.locked : obj.locked,
      hidden: patch.hidden !== undefined ? patch.hidden : obj.hidden,
      collisionEnabled:
        patch.collisionEnabled !== undefined ? patch.collisionEnabled : obj.collisionEnabled,
      position: nextPos,
      rotation: nextRot,
      scale: nextScale,
    };
  });
}

export function updateSelectedMaterial(
  objects: CreatorObject[],
  ids: Set<string>,
  patch: Partial<CreatorMaterialSpec>,
): CreatorObject[] {
  return patchObjectsByIds(objects, ids, (obj) => ({
    ...obj,
    material: {
      ...obj.material,
      ...patch,
      emissive: patch.color && !patch.emissive ? patch.color : (patch.emissive ?? obj.material.emissive),
    },
  }));
}

export function updateSelectedNoteData(
  objects: CreatorObject[],
  ids: Set<string>,
  patch: Partial<CreatorNoteData>,
): CreatorObject[] {
  return patchObjectsByIds(objects, ids, (obj) => {
    if (!obj.noteData) return obj;
    return {
      ...obj,
      lane: patch.lane !== undefined ? patch.lane : obj.lane,
      noteData: {
        ...obj.noteData,
        ...patch,
      },
    };
  });
}

export function updateSelectedTrigger(
  objects: CreatorObject[],
  ids: Set<string>,
  trigger: TriggerConfigPayload,
): CreatorObject[] {
  return patchObjectsByIds(objects, ids, (obj) => ({
    ...obj,
    trigger: structuredClone(trigger),
  }));
}
