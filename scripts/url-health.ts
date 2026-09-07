/**
 * URL の死活確認と画像サイズ取得のユーティリティ
 *
 * 死活確認は全経路をここに一元化する。UA・メソッド・リトライの条件が
 * 呼び出し元ごとにばらつくと、同じ URL が経路によって生死判定が変わる（Issue #359）。
 */

/**
 * ブラウザを装う User-Agent。
 *
 * UA 無し（undici デフォルト）のリクエストを Bot と見なして 403 を返すサイトがあり、
 * 実在する正常なページを「到達不能」と誤判定してしまう。
 * Issue #359: 第20号で capcom-games.com の鬼武者公式ページが UA 無しだと 403 を返し、
 * Completeness Gate の R3 が新作記事を1本除去した（同 URL は UA 付きなら 200）。
 *
 * verify-official-url.ts の fetchPageStructure も同じ UA を使うため、ここで一元管理する。
 */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/**
 * 「URL が明確に存在しない」ことを示す HTTP ステータス。
 * 401/403（認証壁・Bot ブロック）や 429（レート制限）は URL 自体は存在しうるので含めない。
 */
export const NOT_FOUND_STATUS_CODES = new Set([404, 410]);

/**
 * リトライで回復しうる HTTP ステータス（一時的な障害・レート制限）。
 * 403 のような恒久的な拒否は含めない（待っても変わらないため）。
 */
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** GET の試行回数。HEAD を含めた 1 URL あたりの最大リクエスト数は +1 */
const MAX_GET_ATTEMPTS = 2;

/** リトライ前の待機時間の基準値。実際の待機は base × 試行回数 */
const RETRY_BASE_DELAY_MS = 500;

export interface UrlHealthResult {
  ok: boolean;
  /** 最終試行の HTTP ステータス。タイムアウト・ネットワークエラーでは undefined */
  status?: number;
  /** ok=false のときの失敗理由 */
  reason?: string;
}

export interface UrlHealthOptions {
  /** テストで差し替える fetch 実装 */
  fetchImpl?: typeof fetch;
  /** テストで待機を無効化するためのフック */
  sleepImpl?: (ms: number) => Promise<void>;
  /**
   * true にすると失敗時の console.warn を抑止する。
   * 「候補 URL を順に試して落ちるのが正常」な呼び出し（ストアリンクの候補探索など）で、
   * 想定内の空振りがログを埋めて本当の障害を隠さないようにするために使う。
   */
  quiet?: boolean;
}

/** 1 回のリクエスト結果。retryable は呼び出し側のリトライ判断に使う内部情報 */
interface AttemptResult extends UrlHealthResult {
  retryable: boolean;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * URL に 1 回リクエストして到達可否を返す。
 *
 * GET の場合は本文を読まずに破棄する。カバー画像の死活確認にも使われるため、
 * 画像を全量ダウンロードしないようにするための措置。
 */
async function requestOnce(
  url: string,
  method: 'HEAD' | 'GET',
  timeoutMs: number,
  fetchImpl: typeof fetch
): Promise<AttemptResult> {
  try {
    const res = await fetchImpl(url, {
      method,
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        // 画像・HTML どちらの死活確認にも使うため種別を限定しない
        Accept: '*/*',
      },
    });
    if (method === 'GET') {
      await res.body?.cancel().catch(() => {});
    }
    if (res.ok) return { ok: true, status: res.status, retryable: false };
    return {
      ok: false,
      status: res.status,
      reason: `HTTP ${res.status}`,
      retryable: RETRYABLE_STATUS_CODES.has(res.status),
    };
  } catch (err) {
    // タイムアウトはリトライしない。応答しないホストは即座に再試行しても返らないことが多く、
    // 1 URL あたりの最悪実行時間が伸びる（weekly-build は timeout-minutes: 30）。
    //
    // 名前は undici の実装依存。現行（Node 20 / undici 6）は DOMException 'TimeoutError' だが、
    // 過去には 'AbortError' だった。この関数で中断を起こすのは AbortSignal.timeout だけなので
    // 両方をタイムアウト扱いにする（実装が戻ってもリトライが黙って復活しないように）。
    const errName = err instanceof Error ? err.name : '';
    const timedOut = errName === 'TimeoutError' || errName === 'AbortError';
    return { ok: false, reason: String(err), retryable: !timedOut };
  }
}

/**
 * URL の死活確認を行い、失敗時は HTTP ステータスを含む理由を返す。
 *
 * 単純な HEAD 一発では以下を誤判定するため、多段で確認する（Issue #359）:
 * - Bot 判定で 403 を返すサイト → ブラウザ UA を送る
 * - HEAD を許可しない / HEAD にだけ 404 を返すサイト → GET で確認する
 * - 一時的な 5xx・429・ネットワークエラー → リトライする
 *
 * HEAD の失敗は単独では信頼せず、必ず GET で確認する。404/410 は GET でも同じなら
 * 「URL が存在しない」と確定し、リトライしない。
 */
export async function checkUrlHealth(
  url: string,
  timeoutMs = 5000,
  options: UrlHealthOptions = {}
): Promise<UrlHealthResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleepImpl ?? defaultSleep;

  // まず HEAD。成功すれば最も軽く済む
  let last = await requestOnce(url, 'HEAD', timeoutMs, fetchImpl);

  if (!last.ok) {
    for (let attempt = 1; attempt <= MAX_GET_ATTEMPTS; attempt++) {
      last = await requestOnce(url, 'GET', timeoutMs, fetchImpl);
      if (last.ok) break;

      // 404/410 は「存在しない」確定シグナル。リトライしても変わらない
      const definitive = last.status !== undefined && NOT_FOUND_STATUS_CODES.has(last.status);
      if (definitive || !last.retryable || attempt === MAX_GET_ATTEMPTS) break;

      await sleep(RETRY_BASE_DELAY_MS * attempt);
    }
  }

  const result: UrlHealthResult = { ok: last.ok, status: last.status, reason: last.reason };
  if (!result.ok && !options.quiet) {
    console.warn(
      JSON.stringify({
        scope: 'url-health',
        step: 'checkUrlHealth',
        url,
        status: result.status,
        reason: result.reason,
      })
    );
  }
  return result;
}

/**
 * URL が到達可能かを boolean で返す（既存呼び出し元向けの薄いラッパ）。
 * 失敗理由が必要な場合は checkUrlHealth を使う。
 */
export async function headOk(
  url: string,
  timeoutMs = 5000,
  options: UrlHealthOptions = {}
): Promise<boolean> {
  const result = await checkUrlHealth(url, timeoutMs, options);
  return result.ok;
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
    // headOk と同じ UA を送る。UA でブロックするホストで headOk は 200（採用）なのに
    // ここだけ失敗すると、呼び出し側の orientation ?? 'portrait' により横長画像が
    // portrait と誤ラベルされる（Issue #359）
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': BROWSER_USER_AGENT },
    });
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
