import type { CreatorGroup, CreatorObject } from '../types/creator';

const GROUP_SWATCHES = [
  '#22d3ee',
  '#f43f8e',
  '#fbbf24',
  '#a855f7',
  '#34d399',
  '#fb7185',
  '#38bdf8',
  '#fb923c',
];

export class GroupManager {
  public static ensureDefaultGroup(groups: CreatorGroup[]): CreatorGroup[] {
    if (groups.some((g) => g.id === 1)) return groups;
    return [
      {
        id: 1,
        name: 'Grupo Principal',
        color: GROUP_SWATCHES[0],
        locked: false,
        visible: true,
        active: true,
      },
      ...groups,
    ];
  }

  public static nextGroupId(groups: CreatorGroup[]): number {
    let maxId = 0;
    for (const g of groups) {
      if (g.id > maxId) maxId = g.id;
    }
    return maxId + 1;
  }

  public static createGroup(groups: CreatorGroup[], name?: string): {
    groups: CreatorGroup[];
    created: CreatorGroup;
  } {
    const id = GroupManager.nextGroupId(groups);
    const created: CreatorGroup = {
      id,
      name: name?.trim() || `Grupo ${id}`,
      color: GROUP_SWATCHES[(id - 1) % GROUP_SWATCHES.length],
      locked: false,
      visible: true,
      active: true,
    };
    return { groups: [...groups, created], created };
  }

  public static assignGroupToObjects(
    objects: CreatorObject[],
    objectIds: Set<string>,
    groupId: number,
  ): CreatorObject[] {
    return objects.map((obj) => {
      if (!objectIds.has(obj.id)) return obj;
      if (obj.groupIds.includes(groupId)) return obj;
      return { ...obj, groupIds: [...obj.groupIds, groupId] };
    });
  }

  public static removeGroupFromObjects(
    objects: CreatorObject[],
    objectIds: Set<string>,
    groupId: number,
  ): CreatorObject[] {
    return objects.map((obj) => {
      if (!objectIds.has(obj.id)) return obj;
      return { ...obj, groupIds: obj.groupIds.filter((gid) => gid !== groupId) };
    });
  }

  public static mergeGroups(
    groups: CreatorGroup[],
    objects: CreatorObject[],
    sourceGroupId: number,
    targetGroupId: number,
  ): { groups: CreatorGroup[]; objects: CreatorObject[] } {
    if (sourceGroupId === targetGroupId) return { groups, objects };
    const nextObjects = objects.map((obj) => {
      if (!obj.groupIds.includes(sourceGroupId)) return obj;
      const filtered = obj.groupIds.filter((id) => id !== sourceGroupId);
      if (!filtered.includes(targetGroupId)) filtered.push(targetGroupId);
      return { ...obj, groupIds: filtered };
    });
    const nextGroups = groups.filter((g) => g.id !== sourceGroupId);
    return { groups: nextGroups, objects: nextObjects };
  }

  public static copyGroupMemberships(
    groups: CreatorGroup[],
    objects: CreatorObject[],
    sourceGroupId: number,
  ): { groups: CreatorGroup[]; objects: CreatorObject[]; created: CreatorGroup } {
    const src = groups.find((g) => g.id === sourceGroupId);
    const { groups: withNew, created } = GroupManager.createGroup(
      groups,
      src ? `${src.name} (Copia)` : undefined,
    );
    const nextObjects = objects.map((obj) =>
      obj.groupIds.includes(sourceGroupId)
        ? { ...obj, groupIds: [...obj.groupIds, created.id] }
        : obj,
    );
    return { groups: withNew, objects: nextObjects, created };
  }

  public static getObjectIdsInGroup(objects: CreatorObject[], groupId: number): string[] {
    return objects.filter((o) => o.groupIds.includes(groupId)).map((o) => o.id);
  }

  public static isObjectLocked(obj: CreatorObject, groups: CreatorGroup[]): boolean {
    if (obj.locked) return true;
    for (const gid of obj.groupIds) {
      if (groups.find((g) => g.id === gid)?.locked) return true;
    }
    return false;
  }

  public static isObjectVisible(obj: CreatorObject, groups: CreatorGroup[]): boolean {
    if (obj.hidden) return false;
    for (const gid of obj.groupIds) {
      const grp = groups.find((g) => g.id === gid);
      if (grp && (!grp.visible || !grp.active)) return false;
    }
    return true;
  }
}
