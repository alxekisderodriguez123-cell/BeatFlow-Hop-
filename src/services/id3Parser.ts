
import type { SongPalette } from '../types/game';

export interface ParsedId3Tags {
  title?: string;
  artist?: string;
  album?: string;
  coverArtDataUrl?: string;
}

const DEFAULT_PALETTE: SongPalette = {
  primary: '#22d3ee',
  secondary: '#e879f9',
  accent: '#6366f1',
};

function readSynchsafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>> 0
  );
}

function readUint24BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function decodeText(bytes: Uint8Array, encodingByte: number): string {
  if (bytes.length === 0) return '';

  try {
    if (encodingByte === 0) {
      return new TextDecoder('iso-8859-1')
        .decode(bytes)
        .replace(/\0+$/g, '')
        .trim();
    }

    if (encodingByte === 1) {
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be')
          .decode(bytes.subarray(2))
          .replace(/\0+$/g, '')
          .trim();
      }

      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le')
          .decode(bytes.subarray(2))
          .replace(/\0+$/g, '')
          .trim();
      }

      return new TextDecoder('utf-16le')
        .decode(bytes)
        .replace(/\0+$/g, '')
        .trim();
    }

    if (encodingByte === 2) {
      return new TextDecoder('utf-16be')
        .decode(bytes)
        .replace(/\0+$/g, '')
        .trim();
    }

    return new TextDecoder('utf-8')
      .decode(bytes)
      .replace(/\0+$/g, '')
      .trim();
  } catch {
    return new TextDecoder('iso-8859-1')
      .decode(bytes)
      .replace(/\0+$/g, '')
      .trim();
  }
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    binary += String.fromCharCode(...slice);
  }

  return btoa(binary);
}

function parseApicFrame(
  frameData: Uint8Array,
  isV22: boolean,
): string | undefined {
  if (frameData.length < 6) return undefined;

  const encoding = frameData[0];
  let cursor = 1;
  let mimeType = 'image/jpeg';

  if (isV22) {
    const imgFormat = String.fromCharCode(
      frameData[1],
      frameData[2],
      frameData[3],
    ).toUpperCase();

    mimeType = imgFormat === 'PNG' ? 'image/png' : 'image/jpeg';
    cursor = 4;
  } else {
    let mimeEnd = cursor;

    while (mimeEnd < frameData.length && frameData[mimeEnd] !== 0) {
      mimeEnd++;
    }

    const rawMime = new TextDecoder('iso-8859-1')
      .decode(frameData.subarray(cursor, mimeEnd))
      .trim();

    if (rawMime.includes('/')) {
      mimeType = rawMime;
    } else if (rawMime.toLowerCase() === 'png') {
      mimeType = 'image/png';
    }

    cursor = mimeEnd + 1;
  }

  if (cursor >= frameData.length) return undefined;

  // Picture type.
  cursor += 1;

  // Skip image description.
  if (encoding === 1 || encoding === 2) {
    while (cursor + 1 < frameData.length) {
      if (frameData[cursor] === 0 && frameData[cursor + 1] === 0) {
        cursor += 2;
        break;
      }

      cursor += 2;
    }
  } else {
    while (cursor < frameData.length && frameData[cursor] !== 0) {
      cursor++;
    }

    cursor++;
  }

  if (cursor >= frameData.length) return undefined;

  const imageBytes = frameData.subarray(cursor);

  if (imageBytes.length < 32) return undefined;

  if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50) {
    mimeType = 'image/png';
  } else if (imageBytes[0] === 0xff && imageBytes[1] === 0xd8) {
    mimeType = 'image/jpeg';
  }

  return `data:${mimeType};base64,${uint8ArrayToBase64(imageBytes)}`;
}

export function parseMp3Id3Tags(buffer: ArrayBuffer): ParsedId3Tags {
  const bytes = new Uint8Array(buffer);
  const result: ParsedId3Tags = {};

  if (
    bytes.length >= 10 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    const version = bytes[3];
    const flags = bytes[5];
    const tagSize = readSynchsafeInt(bytes, 6);
    const tagEnd = Math.min(bytes.length, 10 + tagSize);

    let offset = 10;

    if ((flags & 0x40) !== 0 && offset + 4 < tagEnd) {
      const extSize =
        version === 4
          ? readSynchsafeInt(bytes, offset)
          : readUint32BE(bytes, offset);

      offset += version === 4 ? extSize : extSize + 4;
    }

    const isV22 = version === 2;
    const headerLen = isV22 ? 6 : 10;

    while (offset + headerLen <= tagEnd) {
      if (bytes[offset] === 0) break;

      let frameId = '';
      let frameSize = 0;

      if (isV22) {
        frameId = String.fromCharCode(
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
        );

        frameSize = readUint24BE(bytes, offset + 3);
      } else {
        frameId = String.fromCharCode(
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
          bytes[offset + 3],
        );

        frameSize =
          version === 4
            ? readSynchsafeInt(bytes, offset + 4)
            : readUint32BE(bytes, offset + 4);
      }

      if (
        frameSize <= 0 ||
        offset + headerLen + frameSize > tagEnd
      ) {
        break;
      }

      const frameData = bytes.subarray(
        offset + headerLen,
        offset + headerLen + frameSize,
      );

      if (frameId === 'TIT2' || frameId === 'TT2') {
        result.title = decodeText(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TPE1' || frameId === 'TP1') {
        result.artist = decodeText(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TALB' || frameId === 'TAL') {
        result.album = decodeText(frameData.subarray(1), frameData[0]);
      } else if (
        (frameId === 'APIC' || frameId === 'PIC') &&
        !result.coverArtDataUrl
      ) {
        result.coverArtDataUrl = parseApicFrame(frameData, isV22);
      }

      offset += headerLen + frameSize;
    }
  }

  // ID3v1 fallback.
  if ((!result.title || !result.artist) && bytes.length >= 128) {
    const v1Offset = bytes.length - 128;

    if (
      bytes[v1Offset] === 0x54 &&
      bytes[v1Offset + 1] === 0x41 &&
      bytes[v1Offset + 2] === 0x47
    ) {
      if (!result.title) {
        const title = new TextDecoder('iso-8859-1')
          .decode(bytes.subarray(v1Offset + 3, v1Offset + 33))
          .replace(/\0+$/g, '')
          .trim();

        if (title) result.title = title;
      }

      if (!result.artist) {
        const artist = new TextDecoder('iso-8859-1')
          .decode(bytes.subarray(v1Offset + 33, v1Offset + 63))
          .replace(/\0+$/g, '')
          .trim();

        if (artist) result.artist = artist;
      }

      if (!result.album) {
        const album = new TextDecoder('iso-8859-1')
          .decode(bytes.subarray(v1Offset + 63, v1Offset + 93))
          .replace(/\0+$/g, '')
          .trim();

        if (album) result.album = album;
      }
    }
  }

  return result;
}

export function cleanTrackNameFromFilename(
  fileName: string,
): { title: string; artist: string } {
  const base = fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/_/g, ' ')
    .trim();

  const dashSplit = base.split(/\s+[-–—]\s+/);

  if (dashSplit.length >= 2) {
    return {
      artist: dashSplit[0].trim() || 'Artista Local',
      title: dashSplit.slice(1).join(' - ').trim() || base,
    };
  }

  return {
    title: base || 'Pista sin título',
    artist: 'Biblioteca Local',
  };
}

// ------------------------------------------------------
// ADVANCED COVER ART COLOR EXTRACTION
// ------------------------------------------------------

interface ColorBucket {
  r: number;
  g: number;
  b: number;
  count: number;
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((value) =>
        Math.round(clamp(value, 0, 255))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (delta !== 0) {
    s = delta / (1 - Math.abs(2 * l - 1));

    switch (max) {
      case r:
        h = ((g - b) / delta) % 6;
        break;
      case g:
        h = (b - r) / delta + 2;
        break;
      default:
        h = (r - g) / delta + 4;
        break;
    }

    h *= 60;
    if (h < 0) h += 360;
  }

  return [h, s, l];
}

function hslToRgb(
  h: number,
  s: number,
  l: number,
): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;

  let r = 0;
  let g = 0;
  let b = 0;

  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }

  return [
    (r + m) * 255,
    (g + m) * 255,
    (b + m) * 255,
  ];
}

function enhanceCoverColor(
  color: ColorBucket,
  variant: 'primary' | 'secondary' | 'accent',
): string {
  const [h, originalS, originalL] = rgbToHsl(
    color.r,
    color.g,
    color.b,
  );

  const saturation = clamp(
    Math.max(originalS, 0.62) *
      (variant === 'accent' ? 1.08 : 1.02),
    0.58,
    1,
  );

  const lightness = clamp(
    originalL,
    variant === 'primary' ? 0.38 : 0.35,
    variant === 'accent' ? 0.68 : 0.62,
  );

  const [r, g, b] = hslToRgb(h, saturation, lightness);

  return rgbToHex(r, g, b);
}

function colorDistance(a: ColorBucket, b: ColorBucket): number {
  return Math.sqrt(
    (a.r - b.r) ** 2 +
      (a.g - b.g) ** 2 +
      (a.b - b.b) ** 2,
  );
}

function makeFallbackAccent(primary: ColorBucket): string {
  const [h, s, l] = rgbToHsl(
    primary.r,
    primary.g,
    primary.b,
  );

  const [r, g, b] = hslToRgb(
    (h + 145) % 360,
    clamp(Math.max(s, 0.65), 0, 1),
    clamp(l + 0.08, 0.42, 0.64),
  );

  return rgbToHex(r, g, b);
}

export async function extractPaletteFromCoverArt(
  coverArtDataUrl?: string,
): Promise<SongPalette> {
  if (!coverArtDataUrl || typeof Image === 'undefined') {
    return { ...DEFAULT_PALETTE };
  }

  return new Promise((resolve) => {
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const size = 48;

        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext('2d', {
          willReadFrequently: true,
        });

        if (!ctx) {
          resolve({ ...DEFAULT_PALETTE });
          return;
        }

        ctx.drawImage(img, 0, 0, size, size);

        const pixels = ctx.getImageData(
          0,
          0,
          size,
          size,
        ).data;

        const histogram = new Map<
          string,
          {
            r: number;
            g: number;
            b: number;
            count: number;
          }
        >();

        for (let i = 0; i < pixels.length; i += 4) {
          const alpha = pixels[i + 3];

          if (alpha < 180) continue;

          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const brightness = (r + g + b) / 3;
          const chroma = max - min;

          if (brightness < 16 || brightness > 248) continue;

          const qr = r >> 3;
          const qg = g >> 3;
          const qb = b >> 3;

          const key = `${qr}_${qg}_${qb}`;
          const current = histogram.get(key);

          if (current) {
            current.r += r;
            current.g += g;
            current.b += b;
            current.count++;
          } else {
            histogram.set(key, {
              r,
              g,
              b,
              count: 1,
            });
          }
        }

        const buckets: ColorBucket[] = [];

        for (const item of histogram.values()) {
          const r = item.r / item.count;
          const g = item.g / item.count;
          const b = item.b / item.count;

          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const chroma = max - min;
          const brightness = (r + g + b) / 3;

          const saturationWeight = 0.45 + chroma / 255;
          const brightnessWeight =
            brightness < 65
              ? 0.68
              : brightness > 220
                ? 0.72
                : 1.0;

          const score =
            item.count *
            saturationWeight *
            brightnessWeight;

          buckets.push({
            r,
            g,
            b,
            count: item.count,
            score,
          });
        }

        buckets.sort((a, b) => b.score - a.score);

        const chromaticBuckets = buckets.filter((color) => {
          const chroma =
            Math.max(color.r, color.g, color.b) -
            Math.min(color.r, color.g, color.b);

          return chroma >= 22;
        });

        const candidates =
          chromaticBuckets.length >= 2
            ? chromaticBuckets
            : buckets;

        if (candidates.length === 0) {
          resolve({ ...DEFAULT_PALETTE });
          return;
        }

        const primary = candidates[0];

        let secondary =
          candidates.find(
            (color) =>
              colorDistance(color, primary) >= 85,
          ) ?? candidates[1];

        if (!secondary) secondary = primary;

        let accent =
          candidates.find(
            (color) =>
              colorDistance(color, primary) >= 115 &&
              colorDistance(color, secondary) >= 75,
          ) ?? candidates[2];

        const primaryHex = enhanceCoverColor(
          primary,
          'primary',
        );

        const secondaryHex = enhanceCoverColor(
          secondary,
          'secondary',
        );

        const accentHex = accent
          ? enhanceCoverColor(accent, 'accent')
          : makeFallbackAccent(primary);

        resolve({
          primary: primaryHex,
          secondary: secondaryHex,
          accent: accentHex,
        });
      } catch {
        resolve({ ...DEFAULT_PALETTE });
      }
    };

    img.onerror = () => {
      resolve({ ...DEFAULT_PALETTE });
    };

    img.src = coverArtDataUrl;
  });
}
