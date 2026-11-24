import * as THREE from 'three';

const EXTRA_NOTE_COLORS = [
  new THREE.Color('#ff6b35'), // Orange
  new THREE.Color('#ffd166'), // Yellow
  new THREE.Color('#06d6a0'), // Emerald
  new THREE.Color('#00e5ff'), // Electric cyan
  new THREE.Color('#a855f7'), // Purple
  new THREE.Color('#ff4ecd'), // Pink
  new THREE.Color('#7cfc00'), // Lime
  new THREE.Color('#ff3864'), // Neon red
  new THREE.Color('#4d7cff'), // Electric blue
  new THREE.Color('#f97316'), // Amber
  new THREE.Color('#e5ff00'), // Acid yellow
  new THREE.Color('#20e3b2'), // Turquoise
];

function stableHash(value: number): number {
  let hash = Math.imul(value ^ 0x45d9f3b, 0x45d9f3b);
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x45d9f3b);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

/**
 * Returns a deterministic color for a note.
 *
 * The same note always receives the same color.
 * This avoids visual flickering between animation frames.
 */
export function resolveNoteColor(
  noteId: number,
  lane: number,
  kind: string,
  primary: THREE.Color,
  secondary: THREE.Color,
  accent: THREE.Color,
): THREE.Color {
  if (kind === 'flick') {
    return accent;
  }

  const palette = [
    primary,
    secondary,
    accent,
    ...EXTRA_NOTE_COLORS,
  ];

  const seed = stableHash(
    Math.imul(noteId + 1, 73856093) ^
    Math.imul(lane + 1, 19349663),
  );

  const index = seed % palette.length;

  return palette[index];
}
