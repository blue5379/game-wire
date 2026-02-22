/**
 * Amazon Bedrock クライアント
 * Claude モデルを使った記事生成のためのクライアント
 */

import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type ContentBlock,
} from '@aws-sdk/client-bedrock-runtime';

// Bedrock クライアントの設定
const BEDROCK_CONFIG = {
  region: process.env.AWS_REGION || 'us-east-1',
  modelId: process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20240620-v1:0',
};

// クライアントインスタンス（シングルトン）
let bedrockClient: BedrockRuntimeClient | null = null;

/**
 * Bedrock クライアントを初期化
 */
export function initializeBedrockClient(): BedrockRuntimeClient {
  if (bedrockClient) {
    return bedrockClient;
  }

  bedrockClient = new BedrockRuntimeClient({
    region: BEDROCK_CONFIG.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  return bedrockClient;
}

/**
 * Claude モデルを呼び出す
 */
export async function invokeClaudeModel(
  systemPrompt: string,
  userMessage: string,
  options: {
    maxTokens?: number;
    temperature?: number;
  } = {}
): Promise<string> {
  const client = initializeBedrockClient();
  const { maxTokens = 4096, temperature = 0.7 } = options;

  const messages: Message[] = [
    {
      role: 'user',
      content: [{ text: userMessage }] as ContentBlock[],
    },
  ];

  const command = new ConverseCommand({
    modelId: BEDROCK_CONFIG.modelId,
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: {
      maxTokens,
      temperature,
    },
  });

  try {
    const response = await client.send(command);

    // レスポンスからテキストを抽出
    const outputContent = response.output?.message?.content;
    if (!outputContent || outputContent.length === 0) {
      throw new Error('Empty response from Bedrock');
    }

    const textBlock = outputContent[0];
    if ('text' in textBlock && textBlock.text) {
      return textBlock.text;
    }

    throw new Error('No text content in response');
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Bedrock API error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * プロンプトテンプレート管理
 */
export const PromptTemplates = {
  /**
   * 大手企業新作紹介記事のシステムプロンプト
   */
  newReleaseSystem: `あなたはゲーム情報Webマガジン「Game Wire」のライターです。
大手ゲーム企業の新作ゲームを紹介する、読み応えのある記事を書いてください。

## 記事構成（必ず以下のセクションをすべて含めてください）

### 1. 導入（100〜150文字）
ゲームの概要と期待度を伝える魅力的な導入文

### 2. 注目ポイント（見出し: ## 🎯 注目ポイント）
このゲームが注目される3つの理由を箇条書きで紹介
- 各ポイントは50〜80文字程度で具体的に説明

### 3. ゲームの特徴（見出し: ## ✨ ゲームの特徴）
ゲームプレイ、グラフィック、ストーリーなどの特徴を詳しく説明（200〜300文字）

### 4. こんな人におすすめ（見出し: ## 👥 こんな人におすすめ）
どんなプレイヤーに向いているか、3つ程度の箇条書き

### 5. 発売情報（見出し: ## 📅 発売情報）
発売日、対応機種、価格帯（わかる場合）などの実用情報

## 記事のスタイル
- 読者はゲームに興味のある一般層
- 専門用語は避け、わかりやすく書く
- 期待感を高める表現を使う
- 絵文字は見出しのみに使用し、本文では使わない
- 日本語で書く

出力形式: Markdown形式で本文のみを出力（タイトルやメタデータは不要）
文字数: 800〜1200文字程度`,

  /**
   * インディーゲーム紹介記事のシステムプロンプト
   */
  indieSystem: `あなたはゲーム情報Webマガジン「Game Wire」のライターです。
話題のインディーゲームを紹介する、読み応えのある記事を書いてください。

## 記事構成（必ず以下のセクションをすべて含めてください）

### 1. 導入（100〜150文字）
なぜこのインディーゲームが話題なのか、魅力的な導入文

### 2. 開発ストーリー（見出し: ## 🎨 開発ストーリー）
開発者や制作背景について（わかる範囲で）100〜150文字

### 3. ゲームの魅力（見出し: ## ✨ ゲームの魅力）
このゲームならではの独自性や魅力を3つの箇条書きで紹介
- 各ポイントは50〜80文字程度で具体的に説明

### 4. プレイヤーの声（見出し: ## 💬 プレイヤーの声）
SteamレビューやSNSでの評判を踏まえた紹介（100〜150文字）

### 5. こんな人におすすめ（見出し: ## 👥 こんな人におすすめ）
どんなプレイヤーに向いているか、3つ程度の箇条書き

## 記事のスタイル
- 個人や小規模チームの作品への敬意を示す
- ゲームの独自性や魅力を伝える
- 絵文字は見出しのみに使用し、本文では使わない
- 日本語で書く

出力形式: Markdown形式で本文のみを出力（タイトルやメタデータは不要）
文字数: 800〜1200文字程度`,

  /**
   * 特集記事のシステムプロンプト
   */
  featureSystem: `あなたはゲーム情報Webマガジン「Game Wire」のライターです。
特定のテーマに沿った特集記事を書いてください。

## 記事構成（必ず以下のセクションをすべて含めてください）

### 1. 導入（150〜200文字）
テーマの魅力と特集の趣旨を伝える導入文

### 2. おすすめゲーム紹介（見出し: ## 🎮 おすすめゲーム○選）
テーマに沿ったゲームを3〜5本紹介
各ゲームについて：
- ゲームタイトル（小見出し ### で）
- 概要（50〜100文字）
- おすすめポイント（箇条書き2〜3つ）

### 3. 選び方のポイント（見出し: ## 💡 選び方のポイント）
テーマに沿ったゲームを選ぶときのコツを100〜150文字で

### 4. まとめ（見出し: ## 📝 まとめ）
特集のまとめと読者へのメッセージ（100文字程度）

## 記事のスタイル
- 読者の興味を引く導入
- 実用的な情報を含める
- 絵文字は見出しのみに使用し、本文では使わない
- 日本語で書く

出力形式: Markdown形式で本文のみを出力（タイトルやメタデータは不要）
文字数: 1000〜1500文字程度`,

  /**
   * 名作深掘り記事のシステムプロンプト
   */
  classicSystem: `あなたはゲーム情報Webマガジン「Game Wire」のライターです。
過去の名作ゲームを深く掘り下げる、読み応えのある記事を書いてください。

## 記事構成（必ず以下のセクションをすべて含めてください）

### 1. 導入（100〜150文字）
なぜこのゲームが名作と呼ばれるのか、魅力的な導入文

### 2. ゲームの歴史（見出し: ## 📜 ゲームの歴史）
発売当時の背景、業界への影響など（150〜200文字）

### 3. 名作たる理由（見出し: ## 🏆 名作たる理由）
高く評価される理由を3つの箇条書きで紹介
- 各ポイントは50〜80文字程度で具体的に説明

### 4. 今プレイする価値（見出し: ## 🎮 今プレイする価値）
現代でもプレイする価値があるか、どう楽しめるか（150〜200文字）

### 5. コミュニティ情報（見出し: ## 👥 コミュニティ情報）
MOD、実況、ファンコミュニティなどの情報（100〜150文字）

### 6. プレイ環境（見出し: ## 💻 プレイ環境）
どこで入手・プレイできるかの実用情報

## 記事のスタイル
- ゲームへの敬意を示す
- 懐かしさと新鮮さの両方を伝える
- 絵文字は見出しのみに使用し、本文では使わない
- 日本語で書く

出力形式: Markdown形式で本文のみを出力（タイトルやメタデータは不要）
文字数: 1000〜1400文字程度`,

  /**
   * 記事タイトル生成のシステムプロンプト
   */
  titleSystem: `あなたはゲーム情報Webマガジン「Game Wire」の編集者です。
与えられた情報を元に、魅力的な記事タイトルを1つだけ生成してください。

タイトルのスタイル:
- 20〜40文字程度
- 読者の興味を引く
- 具体的な内容がわかる
- 日本語で書く

出力形式: タイトルのみを1行で出力（鉤括弧やクォートは不要）`,
};

/**
 * ユーザーメッセージを生成
 */
export function buildUserMessage(
  category: 'newRelease' | 'indie' | 'feature' | 'classic',
  gameInfo: {
    title: string;
    genres?: string[];
    platforms?: string[];
    releaseDate?: string;
    developer?: string;
    publisher?: string;
    summary?: string;
    metascore?: number | null;
    userScore?: number | null;
  },
  additionalContext?: string
): string {
  const lines: string[] = [];

  lines.push(`【ゲーム情報】`);
  lines.push(`タイトル: ${gameInfo.title}`);

  if (gameInfo.genres && gameInfo.genres.length > 0) {
    lines.push(`ジャンル: ${gameInfo.genres.join(', ')}`);
  }

  if (gameInfo.platforms && gameInfo.platforms.length > 0) {
    lines.push(`対応機種: ${gameInfo.platforms.join(', ')}`);
  }

  if (gameInfo.releaseDate) {
    lines.push(`発売日: ${gameInfo.releaseDate}`);
  }

  if (gameInfo.developer) {
    lines.push(`開発: ${gameInfo.developer}`);
  }

  if (gameInfo.publisher) {
    lines.push(`発売元: ${gameInfo.publisher}`);
  }

  if (gameInfo.summary) {
    lines.push(`概要: ${gameInfo.summary}`);
  }

  if (gameInfo.metascore !== undefined && gameInfo.metascore !== null) {
    lines.push(`Metacriticスコア: ${gameInfo.metascore}`);
  }

  if (gameInfo.userScore !== undefined && gameInfo.userScore !== null) {
    lines.push(`ユーザースコア: ${gameInfo.userScore}`);
  }

  if (additionalContext) {
    lines.push('');
    lines.push(`【追加情報】`);
    lines.push(additionalContext);
  }

  lines.push('');
  lines.push('上記の情報を元に、記事本文を書いてください。');

  return lines.join('\n');
}

/**
 * 特集記事用のユーザーメッセージを生成
 */
export function buildFeatureUserMessage(
  theme: string,
  date: Date,
  relatedGames?: Array<{ title: string; summary?: string }>
): string {
  const lines: string[] = [];

  lines.push(`【特集テーマ】`);
  lines.push(`テーマ: ${theme}`);
  lines.push(`発行日: ${date.toISOString().split('T')[0]}`);

  if (relatedGames && relatedGames.length > 0) {
    lines.push('');
    lines.push(`【関連ゲーム】`);
    for (const game of relatedGames) {
      lines.push(`- ${game.title}${game.summary ? `: ${game.summary}` : ''}`);
    }
  }

  lines.push('');
  lines.push('上記のテーマに沿った特集記事を書いてください。');

  return lines.join('\n');
}

/**
 * 日付ベースでイベントテーマを判定
 */
export function determineFeatureTheme(date: Date): string {
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // 特定の日付イベント
  if (month === 2 && day === 14) {
    return 'バレンタイン特集：大切な人と一緒に楽しめるゲーム';
  }
  if (month === 3 && day >= 14 && day <= 20) {
    return 'ホワイトデー特集：贈り物にぴったりなゲーム';
  }
  if (month === 10 && day >= 25 && day <= 31) {
    return 'ハロウィン特集：ホラーゲーム＆不気味な世界観のゲーム';
  }
  if (month === 12 && day >= 20 && day <= 25) {
    return 'クリスマス特集：冬に楽しみたいゲーム';
  }
  if (month === 12 && day >= 28 || month === 1 && day <= 3) {
    return '年末年始特集：長期休暇にじっくり遊びたいゲーム';
  }

  // 季節イベント
  if (month >= 3 && month <= 5) {
    const themes = [
      '春の新生活特集：新しく始めるのにぴったりなゲーム',
      'GW直前特集：連休に遊びたいゲーム',
      '春のセール情報：お買い得タイトルまとめ',
    ];
    return themes[Math.floor(Math.random() * themes.length)];
  }
  if (month >= 6 && month <= 8) {
    const themes = [
      '夏休み特集：夏に遊びたいゲーム',
      'サマーセール特集：お買い得タイトルまとめ',
      '暑い夏に涼しくなるホラーゲーム特集',
    ];
    return themes[Math.floor(Math.random() * themes.length)];
  }
  if (month >= 9 && month <= 11) {
    const themes = [
      '秋の夜長特集：じっくり遊べるRPG',
      'ゲームの秋特集：この秋の注目タイトル',
      '読書の秋ならぬ、ゲームの秋特集',
    ];
    return themes[Math.floor(Math.random() * themes.length)];
  }

  // デフォルト
  return '今週の注目ゲーム特集';
}

/**
 * レスポンスをパース（Markdown本文のみを抽出）
 */
export function parseArticleResponse(response: string): string {
  // コードブロックで囲まれている場合は除去
  let content = response.trim();

  if (content.startsWith('```markdown')) {
    content = content.slice('```markdown'.length);
  } else if (content.startsWith('```')) {
    content = content.slice(3);
  }

  if (content.endsWith('```')) {
    content = content.slice(0, -3);
  }

  return content.trim();
}

/**
 * タイトルレスポンスをパース
 */
export function parseTitleResponse(response: string): string {
  // 余分な記号を除去
  let title = response.trim();

  // クォートや鉤括弧を除去
  title = title.replace(/^["'「『]/, '').replace(/["'」』]$/, '');

  // 改行以降は除去
  title = title.split('\n')[0];

  return title.trim();
}

/**
 * YouTube動画情報からゲーム情報を推測するプロンプト
 */
export const gameInfoInferencePrompt = `あなたはゲーム情報の専門家です。
YouTube動画のタイトルと説明文から、ゲームの情報を推測してください。

## 出力形式（必ずJSON形式で出力）
{
  "genres": ["ジャンル1", "ジャンル2"],
  "platforms": ["対応機種1", "対応機種2"],
  "developer": "開発者/開発会社名（不明な場合はnull）",
  "summary": "ゲームの概要（50〜100文字）"
}

## ジャンルの候補
- Horror（ホラー）
- Action（アクション）
- Adventure（アドベンチャー）
- RPG（ロールプレイング）
- Simulation（シミュレーション）
- Puzzle（パズル）
- Shooter（シューター）
- Sports（スポーツ）
- Racing（レーシング）
- Fighting（格闘）
- Sandbox（サンドボックス）
- Indie（インディー）

## 対応機種の候補
- PC (Steam)
- PlayStation 5
- PlayStation 4
- Xbox Series X|S
- Xbox One
- Nintendo Switch
- iOS
- Android

## 重要なルール
- 動画情報から確実に推測できる情報のみを含める
- 不確かな情報は含めない
- ジャンルは1〜3つ程度
- 対応機種が不明な場合は["PC (Steam)"]をデフォルトとする
- JSON以外の文字は出力しない`;

/**
 * YouTube動画情報からゲーム情報を推測
 */
export interface InferredGameInfo {
  genres: string[];
  platforms: string[];
  developer?: string;
  summary?: string;
}

export async function inferGameInfoFromYouTube(
  videoTitles: string[],
  videoDescriptions: string[]
): Promise<InferredGameInfo | null> {
  const userMessage = `以下のYouTube動画情報からゲームの情報を推測してください。

【動画タイトル】
${videoTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

【動画説明文（抜粋）】
${videoDescriptions.filter(d => d.length > 0).slice(0, 3).map((d, i) => `${i + 1}. ${d.slice(0, 200)}`).join('\n')}

上記の情報からゲームの詳細を推測し、JSON形式で出力してください。`;

  try {
    const response = await invokeClaudeModel(
      gameInfoInferencePrompt,
      userMessage,
      { maxTokens: 500, temperature: 0.3 }
    );

    // JSONをパース
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('Failed to extract JSON from response');
      return null;
    }

    const parsed = JSON.parse(jsonMatch[0]) as InferredGameInfo;

    // 最低限のバリデーション
    if (!Array.isArray(parsed.genres) || !Array.isArray(parsed.platforms)) {
      console.warn('Invalid response structure');
      return null;
    }

    return {
      genres: parsed.genres.filter(g => typeof g === 'string'),
      platforms: parsed.platforms.filter(p => typeof p === 'string'),
      developer: typeof parsed.developer === 'string' ? parsed.developer : undefined,
      summary: typeof parsed.summary === 'string' ? parsed.summary : undefined,
    };
  } catch (error) {
    console.error('Failed to infer game info:', error);
    return null;
  }
}
