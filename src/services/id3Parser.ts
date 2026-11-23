import type { SongPalette } from '../types/game';

export interface ParsedId3Tags {
  title?: string;
  artist?: string;
  album?: string;
  coverArtDataUrl?: string;
}

const DEFAULT_PALETTE: SongPalette = {
  primary: '#22d3ee', // luminous cyan
  secondary: '#e879f9', // neon magenta
  accent: '#6366f1', // electric indigo
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
      bytes[offset + 3]) >>>
    0
  );
}

function readUint24BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function decodeText(bytes: Uint8Array, encodingByte: number): string {
  if (bytes.length === 0) return '';
  try {
    if (encodingByte === 0) {
      // ISO-8859-1 / Latin1
      return new TextDecoder('iso-8859-1').decode(bytes).replace(/\0+$/g, '').trim();
    }
    if (encodingByte === 1) {
      // UTF-16 with BOM
      if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
        return new TextDecoder('utf-16be').decode(bytes.subarray(2)).replace(/\0+$/g, '').trim();
      }
      if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
        return new TextDecoder('utf-16le').decode(bytes.subarray(2)).replace(/\0+$/g, '').trim();
      }
      return new TextDecoder('utf-16le').decode(bytes).replace(/\0+$/g, '').trim();
    }
    if (encodingByte === 2) {
      // UTF-16BE without BOM
      return new TextDecoder('utf-16be').decode(bytes).replace(/\0+$/g, '').trim();
    }
    // UTF-8 (encodingByte === 3)
    return new TextDecoder('utf-8').decode(bytes).replace(/\0+$/g, '').trim();
  } catch {
    return new TextDecoder('latin1').decode(bytes).replace(/\0+$/g, '').trim();
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

function parseApicFrame(frameData: Uint8Array, isV22: boolean): string | undefined {
  if (frameData.length < 6) return undefined;
  const encoding = frameData[0];
  let cursor = 1;
  let mimeType = 'image/jpeg';

  if (isV22) {
    const imgFormat = String.fromCharCode(frameData[1], frameData[2], frameData[3]).toUpperCase();
    mimeType = imgFormat === 'PNG' ? 'image/png' : 'image/jpeg';
    cursor = 4;
  } else {
    let mimeEnd = cursor;
    while (mimeEnd < frameData.length && frameData[mimeEnd] !== 0) {
      mimeEnd++;
    }
    const rawMime = new TextDecoder('latin1').decode(frameData.subarray(cursor, mimeEnd)).trim();
    if (rawMime.includes('/')) {
      mimeType = rawMime;
    } else if (rawMime.toLowerCase() === 'png') {
      mimeType = 'image/png';
    }
    cursor = mimeEnd + 1;
  }

  if (cursor >= frameData.length) return undefined;
  // Picture type byte
  cursor += 1;

  // Skip description (null-terminated according to encoding)
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
    cursor += 1;
  }

  if (cursor >= frameData.length) return undefined;
  const imageBytes = frameData.subarray(cursor);
  if (imageBytes.length < 32) return undefined;

  // Detect PNG/JPEG magic bytes as sanity fallback
  if (imageBytes[0] === 0x89 && imageBytes[1] === 0x50) mimeType = 'image/png';
  else if (imageBytes[0] === 0xff && imageBytes[1] === 0xd8) mimeType = 'image/jpeg';

  return `data:${mimeType};base64,${uint8ArrayToBase64(imageBytes)}`;
}

export function parseMp3Id3Tags(buffer: ArrayBuffer): ParsedId3Tags {
  const bytes = new Uint8Array(buffer);
  const result: ParsedId3Tags = {};

  // Parse ID3v2 at start of file
  if (bytes.length >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const version = bytes[3]; // 2, 3, or 4
    const flags = bytes[5];
    const tagSize = readSynchsafeInt(bytes, 6);
    const tagEnd = Math.min(bytes.length, 10 + tagSize);

    let offset = 10;
    // Skip extended header if present
    if ((flags & 0x40) !== 0 && offset + 4 < tagEnd) {
      const extSize = version === 4 ? readSynchsafeInt(bytes, offset) : readUint32BE(bytes, offset);
      offset += version === 4 ? extSize : extSize + 4;
    }

    const isV22 = version === 2;
    const headerLen = isV22 ? 6 : 10;

    while (offset + headerLen <= tagEnd) {
      if (bytes[offset] === 0) break; // padding

      let frameId = '';
      let frameSize = 0;

      if (isV22) {
        frameId = String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2]);
        frameSize = readUint24BE(bytes, offset + 3);
      } else {
        frameId = String.fromCharCode(
          bytes[offset],
          bytes[offset + 1],
          bytes[offset + 2],
          bytes[offset + 3],
        );
        frameSize =
          version === 4 ? readSynchsafeInt(bytes, offset + 4) : readUint32BE(bytes, offset + 4);
      }

      if (frameSize <= 0 || offset + headerLen + frameSize > tagEnd) break;

      const frameData = bytes.subarray(offset + headerLen, offset + headerLen + frameSize);

      if (frameId === 'TIT2' || frameId === 'TT2') {
        result.title = decodeText(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TPE1' || frameId === 'TP1') {
        result.artist = decodeText(frameData.subarray(1), frameData[0]);
      } else if (frameId === 'TALB' || frameId === 'TAL') {
        result.album = decodeText(frameData.subarray(1), frameData[0]);
      } else if ((frameId === 'APIC' || frameId === 'PIC') && !result.coverArtDataUrl) {
        result.coverArtDataUrl = parseApicFrame(frameData, isV22);
      }

      offset += headerLen + frameSize;
    }
  }

  // Fallback to ID3v1 at end of file if title or artist missing
  if ((!result.title || !result.artist) && bytes.length >= 128) {
    const v1Offset = bytes.length - 128;
    if (bytes[v1Offset] === 0x54 && bytes[v1Offset + 1] === 0x41 && bytes[v1Offset + 2] === 0x47) {
      if (!result.title) {
        const t = new TextDecoder('iso-8859-1')
          .decode(bytes.subarray(v1Offset + 3, v1Offset + 33))
          .replace(/\0+$/g, '')
          .trim();
        if (t) result.title = t;
      }
      if (!result.artist) {
        const a = new TextDecoder('iso-8859-1')
          .decode(bytes.subarray(v1Offset + 33, v1Offset + 63))
          .replace(/\0+$/g, '')
          .trim();
        if (a) result.artist = a;
      }
      if (!result.album) {
        const al = new TextDecoder('iso-8859-1')
          .decode(bytes.subarray(v1Offset + 63, v1Offset + 93))
          .replace(/\0+$/g, '')
          .trim();
        if (al) result.album = al;
      }
    }
  }

  return result;
}

export function cleanTrackNameFromFilename(fileName: string): { title: string; artist: string } {
  const base = fileName.replace(/\.[^/.]+$/, '').replace(/_/g, ' ').trim();
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

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
  );
}

function boostSaturation(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const avg = (r + g + b) / 3;
  if (max - min < 20) {
    // Low saturation cover art -> fall back toward vibrant neon tint
    return [34, 211, 238];
  }
  const factor = 1.45;
  const nr = Math.min(255, Math.max(20, avg + (r - avg) * factor + 25));
  const ng = Math.min(255, Math.max(20, avg + (g - avg) * factor + 15));
  const nb = Math.min(255, Math.max(30, avg + (b - avg) * factor + 35));
  return [nr, ng, nb];
}

export async function extractPaletteFromCoverArt(coverArtDataUrl?: string): Promise<SongPalette> {
  if (!coverArtDataUrl) return { ...DEFAULT_PALETTE };

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 24;
        canvas.height = 24;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve({ ...DEFAULT_PALETTE });
          return;
        }
        ctx.drawImage(img, 0, 0, 24, 24);
        const data = ctx.getImageData(0, 0, 24, 24).data;

        const buckets: Array<{ r: number; g: number; b: number; weight: number }> = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const brightness = (r + g + b) / 3;
          const chroma = Math.max(r, g, b) - Math.min(r, g, b);
          if (brightness < 28 || brightness > 240) continue;
          const weight = 1 + chroma / 40;
          buckets.push({ r, g, b, weight });
        }

        if (buckets.length < 4) {
          resolve({ ...DEFAULT_PALETTE });
          return;
        }

        // Split into warm/cool or top chromatic samples for primary & secondary
        buckets.sort((a, b) => b.weight - a.weight);
        const pSample = buckets[0];
        let sSample = buckets[Math.floor(buckets.length / 3)] ?? pSample;

        for (let i = 1; i < buckets.length; i++) {
          const c = buckets[i];
          const dist =
            Math.abs(c.r - pSample.r) + Math.abs(c.g - pSample.g) + Math.abs(c.b - pSample.b);
          if (dist > 140) {
            sSample = c;
            break;
          }
        }

        const [pr, pg, pb] = boostSaturation(pSample.r, pSample.g, pSample.b);
        const [sr, sg, sb] = boostSaturation(sSample.r, sSample.g, sSample.b);

        resolve({
          primary: rgbToHex(pr, pg, pb),
          secondary: rgbToHex(sr, sg, sb),
          accent: '#818cf8',
        });
      } catch {
        resolve({ ...DEFAULT_PALETTE });
      }
    };
    img.onerror = () => resolve({ ...DEFAULT_PALETTE });
    img.src = coverArtDataUrl;
  });
}
