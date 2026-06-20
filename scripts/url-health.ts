/**
 * URL の死活確認と画像サイズ取得のユーティリティ
 * build-issue.ts の isUrlAlive と同等の HEAD 確認を一元化する
 */

export async function headOk(url: string, timeoutMs = 5000): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type ImageOrientation = 'portrait' | 'landscape';

/**
 * 画像 URL を取得してアスペクト比から向きを返す。
 * 取得失敗または幅・高さが不明な場合は null。
 * width >= height のとき landscape、それ以外は portrait。
 */
export async function getImageOrientation(
  url: string,
  timeoutMs = 8000
): Promise<ImageOrientation | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);

    const size = parseImageSize(bytes);
    if (!size) return null;

    return size.width >= size.height ? 'landscape' : 'portrait';
  } catch (err) {
    console.warn(
      JSON.stringify({ scope: 'url-health', step: 'getImageOrientation', url, reason: String(err) })
    );
    return null;
  }
}

interface ImageSize {
  width: number;
  height: number;
}

/**
 * バイト列の先頭から画像の幅・高さを読み取る。
 * JPEG / PNG / WebP / GIF をサポート。
 */
function parseImageSize(bytes: Uint8Array): ImageSize | null {
  if (bytes.length < 24) return null;

  // PNG: 8-byte signature + IHDR chunk (width at offset 16, height at offset 20)
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    const width = readUint32BE(bytes, 16);
    const height = readUint32BE(bytes, 20);
    if (width && height) return { width, height };
  }

  // GIF: "GIF87a" or "GIF89a" (width at offset 6, height at offset 8, little-endian)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    const width = readUint16LE(bytes, 6);
    const height = readUint16LE(bytes, 8);
    if (width && height) return { width, height };
  }

  // WebP: "RIFF????WEBP" then "VP8 ", "VP8L", or "VP8X"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    if (bytes.length >= 30) {
      const chunk = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
      if (chunk === 'VP8 ' && bytes.length >= 30) {
        // Lossy: width/height at bytes 26-29 (14-bit values, little-endian)
        const w = (readUint16LE(bytes, 26) & 0x3fff) + 1;
        const h = (readUint16LE(bytes, 28) & 0x3fff) + 1;
        if (w && h) return { width: w, height: h };
      } else if (chunk === 'VP8L' && bytes.length >= 25) {
        // Lossless: bits 1-14 = width-1, bits 15-28 = height-1
        const b0 = bytes[21], b1 = bytes[22], b2 = bytes[23], b3 = bytes[24];
        const w = ((b0 | (b1 << 8)) & 0x3fff) + 1;
        const h = (((b1 >> 6) | (b2 << 2) | (b3 << 10)) & 0x3fff) + 1;
        if (w && h) return { width: w, height: h };
      } else if (chunk === 'VP8X' && bytes.length >= 30) {
        // Extended: canvas width-1 at bytes 24-26 (24-bit LE), height-1 at bytes 27-29
        const w = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
        const h = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
        if (w && h) return { width: w, height: h };
      }
    }
  }

  // JPEG: scan for SOF (Start of Frame) markers
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 8 < bytes.length) {
      if (bytes[i] !== 0xff) break;
      const marker = bytes[i + 1];
      const segLen = readUint16BE(bytes, i + 2);
      // SOF markers: 0xC0–0xC3, 0xC5–0xC7, 0xC9–0xCB, 0xCD–0xCF
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        const height = readUint16BE(bytes, i + 5);
        const width = readUint16BE(bytes, i + 7);
        if (width && height) return { width, height };
      }
      i += 2 + segLen;
    }
  }

  return null;
}

function readUint32BE(buf: Uint8Array, offset: number): number {
  return ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>> 0;
}

function readUint16BE(buf: Uint8Array, offset: number): number {
  return (buf[offset] << 8) | buf[offset + 1];
}

function readUint16LE(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}
