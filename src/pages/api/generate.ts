/**
 * 記事生成APIエンドポイント（開発モード専用）
 * POST /api/generate
 */

import type { APIRoute } from 'astro';
import { spawn } from 'child_process';

export const prerender = false;

// 開発モードのみ有効
const isDev = import.meta.env.DEV;

function runCommand(command: string, args: string[]): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: process.cwd(),
      shell: true,
      env: { ...process.env },
    });

    let output = '';

    proc.stdout.on('data', (data) => {
      output += data.toString();
    });

    proc.stderr.on('data', (data) => {
      output += data.toString();
    });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output,
      });
    });

    proc.on('error', (err) => {
      resolve({
        success: false,
        output: err.message,
      });
    });
  });
}

export const POST: APIRoute = async ({ request }) => {
  // 開発モード以外は拒否
  if (!isDev) {
    return new Response(JSON.stringify({ error: 'This endpoint is only available in development mode' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const body = await request.json().catch(() => ({}));
  const action = body.action || 'build-issue';

  let result;

  switch (action) {
    case 'fetch-data':
      result = await runCommand('npx', ['tsx', 'scripts/fetch-data.ts']);
      break;
    case 'generate':
      result = await runCommand('npx', ['tsx', 'scripts/generate-articles.ts']);
      break;
    case 'build-issue':
      // fetch-data → generate を順次実行
      const fetchResult = await runCommand('npx', ['tsx', 'scripts/fetch-data.ts']);
      if (!fetchResult.success) {
        return new Response(JSON.stringify({
          success: false,
          step: 'fetch-data',
          output: fetchResult.output,
        }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const generateResult = await runCommand('npx', ['tsx', 'scripts/generate-articles.ts']);
      result = {
        success: generateResult.success,
        output: fetchResult.output + '\n---\n' + generateResult.output,
      };
      break;
    default:
      return new Response(JSON.stringify({ error: 'Invalid action' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
  }

  return new Response(JSON.stringify({
    success: result.success,
    action,
    output: result.output,
  }), {
    status: result.success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};
