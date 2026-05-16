/**
 * ゲーム紹介履歴管理モジュール
 * カテゴリ別クールダウン期間で同じゲームの重複紹介を防ぐ
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// 開発モード判定
const DEV_MODE = process.env.DEV_MODE === 'true';

// 履歴ファイルパス
const HISTORY_PATH = DEV_MODE
  ? path.join(process.cwd(), 'src', 'content', 'history-dev.json')
  : path.join(process.cwd(), 'src', 'content', 'history.json');

// カテゴリ別クールダウン期間（週）
const COOLDOWN_WEEKS: Record<string, number> = {
  newRelease: 17, // 約4ヶ月
  indie: 35,      // 約8ヶ月
  classic: 52,    // 約12ヶ月
  feature: 0,
};

export interface HistoryEntry {
  normalizedTitle: string;
  title: string;
  category: 'newRelease' | 'indie' | 'feature' | 'classic';
  issueNumber: number;
  publishDate: string; // YYYY-MM-DD
}

interface HistoryFile {
  version: number;
  entries: HistoryEntry[];
}

/**
 * タイトルを正規化（比較用）
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[：:]/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/[™®©]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 履歴ファイルを読み込む（存在しない場合は空の履歴を返す）
 */
export function loadHistory(): HistoryFile {
  if (!fs.existsSync(HISTORY_PATH)) {
    return { version: 1, entries: [] };
  }

  try {
    const raw = fs.readFileSync(HISTORY_PATH, 'utf-8');
    return JSON.parse(raw) as HistoryFile;
  } catch (error) {
    throw new Error(`Failed to load history file (${HISTORY_PATH}): ${error}\nFix the JSON before running again.`);
  }
}

/**
 * 履歴に新しいエントリを追記して保存
 */
export function saveHistory(newEntries: HistoryEntry[]): void {
  const history = loadHistory();
  history.entries.push(...newEntries);

  // 出力ディレクトリが存在しない場合は作成
  const dir = path.dirname(HISTORY_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2));
  console.log(`History saved to: ${HISTORY_PATH} (${history.entries.length} total entries)`);
}

/**
 * カテゴリ別クールダウン中のタイトルセットを取得
 * @param category 対象カテゴリ
 * @param currentDate 現在日付（省略時は今日）
 * @returns クールダウン中の正規化タイトルセット
 */
export function getCooldownTitles(
  category: 'newRelease' | 'indie' | 'feature' | 'classic',
  currentDate: Date = new Date()
): Set<string> {
  const cooldownWeeks = COOLDOWN_WEEKS[category] ?? 0;
  if (cooldownWeeks === 0) {
    return new Set();
  }

  const history = loadHistory();
  const cooldownMs = cooldownWeeks * 7 * 24 * 60 * 60 * 1000;
  const cooldownSet = new Set<string>();

  for (const entry of history.entries) {
    const publishDate = new Date(entry.publishDate);
    const elapsed = currentDate.getTime() - publishDate.getTime();

    if (elapsed < cooldownMs) {
      cooldownSet.add(entry.normalizedTitle);
    }
  }

  return cooldownSet;
}

/**
 * 現在の履歴ファイルパスを返す（デバッグ・テスト用）
 */
export function getHistoryPath(): string {
  return HISTORY_PATH;
}

/**
 * HistoryEntry を生成するヘルパー
 */
export function createHistoryEntry(
  title: string,
  category: 'newRelease' | 'indie' | 'feature' | 'classic',
  issueNumber: number,
  publishDate: string
): HistoryEntry {
  return {
    normalizedTitle: normalizeTitle(title),
    title,
    category,
    issueNumber,
    publishDate,
  };
}
