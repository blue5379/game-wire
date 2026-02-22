/**
 * 特集記事用画像生成スクリプト
 * Amazon Bedrock Titan Image Generator を使用
 */

import { config } from 'dotenv';

// .env.local を優先的に読み込み
config({ path: '.env.local' });
config({ path: '.env' });

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { invokeClaudeModel } from './bedrock-client.js';

// 画像生成の設定
const IMAGE_CONFIG = {
  region: process.env.AWS_REGION || 'ap-northeast-1',
  // Amazon Nova Canvas を使用
  modelId: 'amazon.nova-canvas-v1:0',
  // 16:9 アスペクト比
  width: 1280,
  height: 720,
  cfgScale: 8.0,
  quality: 'standard' as const,
  numberOfImages: 1,
};

// 出力ディレクトリ
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'images', 'features');

// Bedrock クライアント（シングルトン）
let imageClient: BedrockRuntimeClient | null = null;

/**
 * Bedrock クライアントを初期化
 */
function getImageClient(): BedrockRuntimeClient {
  if (imageClient) {
    return imageClient;
  }

  imageClient = new BedrockRuntimeClient({
    region: IMAGE_CONFIG.region,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
  });

  return imageClient;
}

/**
 * 特集テーマから画像生成用プロンプトを生成
 */
async function generateImagePrompt(theme: string): Promise<string> {
  const systemPrompt = `あなたは画像生成AIのプロンプトエンジニアです。
与えられたゲーム特集テーマから、魅力的な画像を生成するための英語プロンプトを作成してください。

ルール:
- 出力は英語のみ
- 100単語以内
- ゲームに関連する抽象的で雰囲気のある画像を意識
- 具体的なキャラクターや著作権のある要素は含めない
- 以下の要素を含める: スタイル、雰囲気、色調、構図
- プロンプトのみを出力（説明不要）

例:
テーマ: ハロウィン特集
出力: A spooky gaming atmosphere with jack-o-lanterns glowing in purple and orange hues, gothic castle silhouette in background, bats flying across a full moon, dark fantasy style, cinematic lighting, highly detailed digital art`;

  const userMessage = `テーマ: ${theme}`;

  try {
    const response = await invokeClaudeModel(systemPrompt, userMessage, {
      maxTokens: 200,
      temperature: 0.7,
    });
    return response.trim();
  } catch (error) {
    console.warn('Failed to generate image prompt, using fallback');
    // フォールバックプロンプト
    return 'A vibrant gaming scene with colorful neon lights, abstract digital art style, modern game aesthetic, dynamic composition, professional quality';
  }
}

/**
 * Titan Image Generator で画像を生成
 */
async function generateImage(prompt: string): Promise<Buffer> {
  const client = getImageClient();

  const requestBody = {
    taskType: 'TEXT_IMAGE',
    textToImageParams: {
      text: prompt,
      negativeText: 'blurry, low quality, distorted, watermark, text, logo',
    },
    imageGenerationConfig: {
      numberOfImages: IMAGE_CONFIG.numberOfImages,
      width: IMAGE_CONFIG.width,
      height: IMAGE_CONFIG.height,
      cfgScale: IMAGE_CONFIG.cfgScale,
      quality: IMAGE_CONFIG.quality,
      seed: Math.floor(Math.random() * 858993460),
    },
  };

  console.log('  Requesting image generation...');
  console.log(`  Prompt: ${prompt.substring(0, 100)}...`);

  const command = new InvokeModelCommand({
    modelId: IMAGE_CONFIG.modelId,
    body: JSON.stringify(requestBody),
    accept: 'application/json',
    contentType: 'application/json',
  });

  const response = await client.send(command);

  // レスポンスをパース
  const responseBody = JSON.parse(new TextDecoder().decode(response.body));

  // エラーチェック
  if (responseBody.error) {
    throw new Error(`Image generation error: ${responseBody.error}`);
  }

  // Base64画像をデコード
  const base64Image = responseBody.images[0];
  const imageBuffer = Buffer.from(base64Image, 'base64');

  return imageBuffer;
}

/**
 * 画像をファイルに保存
 */
function saveImage(buffer: Buffer, filename: string): string {
  // 出力ディレクトリを作成
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const outputPath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(outputPath, buffer);

  // 相対パスを返す（Webサイトで使用）
  return `/images/features/${filename}`;
}

/**
 * 特集テーマから画像を生成して保存
 */
export async function generateFeatureImage(
  theme: string,
  issueNumber: number
): Promise<string> {
  console.log(`Generating feature image for: ${theme}`);

  // 1. テーマから画像プロンプトを生成
  const imagePrompt = await generateImagePrompt(theme);
  console.log(`  Generated prompt: ${imagePrompt}`);

  // 2. 画像を生成
  const imageBuffer = await generateImage(imagePrompt);
  console.log(`  Image generated: ${imageBuffer.length} bytes`);

  // 3. ファイル名を生成して保存
  const timestamp = Date.now();
  const filename = `feature-${issueNumber}-${timestamp}.png`;
  const imagePath = saveImage(imageBuffer, filename);
  console.log(`  Saved to: ${imagePath}`);

  return imagePath;
}

/**
 * テスト実行用のメイン関数
 */
async function main(): Promise<void> {
  console.log('=== Feature Image Generation Test ===');
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log('');

  // テスト用のテーマ
  const testTheme = 'バレンタイン特集：大切な人と一緒に楽しめるゲーム';
  const testIssueNumber = 999;

  try {
    const imagePath = await generateFeatureImage(testTheme, testIssueNumber);
    console.log('');
    console.log('=== Result ===');
    console.log(`Image path: ${imagePath}`);
    console.log(`Full path: ${path.join(process.cwd(), 'public', imagePath)}`);
  } catch (error) {
    console.error('Failed to generate image:', error);
    process.exit(1);
  }

  console.log('');
  console.log(`Finished at: ${new Date().toISOString()}`);
}

// 直接実行された場合のみテストを実行
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
