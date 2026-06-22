import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

import { pool } from '../db/index.js';
import { syncDingtalkData, syncDingtalkInstance } from '../routes/sync.js';

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;

    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.trim();
    const next = argv[index + 1];

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (next && !next.startsWith('--')) {
      args[key] = next;
      index++;
    } else {
      args[key] = true;
    }
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  npm run sync:dingtalk
  npm run sync:dingtalk -- --days 90
  npm run sync:dingtalk -- --days 90 --update-existing
  npm run sync:dingtalk -- --start 2026-06-01 --end 2026-06-03
  npm run sync:dingtalk -- --instance <processInstanceId>

Options:
  --days <n>           Sync the last n days. Default: 30.
  --start <date>       Start date/time. Supports YYYY-MM-DD, ISO string, or millisecond timestamp.
  --end <date>         End date/time. Supports YYYY-MM-DD, ISO string, or millisecond timestamp.
  --instance <id>      Sync one DingTalk process instance by ID.
  --update-existing    更新已存在的记录（用于回填 total_amount 等新字段）
  --help               Show this help.
`);
}

function parseTime(value, endOfDay = false) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    return Number(text);
  }

  const dateText = /^\d{4}-\d{2}-\d{2}$/.test(text)
    ? `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`
    : text;
  const time = new Date(dateText).getTime();

  if (Number.isNaN(time)) {
    throw new Error(`Invalid date/time: ${value}`);
  }

  return time;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const instanceId = args.instance || args.processInstanceId || args.process_instance_id;
  if (instanceId) {
    console.log(`[SCRIPT] Syncing DingTalk instance: ${instanceId}`);
    const result = await syncDingtalkInstance(instanceId);
    console.log('[SCRIPT] Sync result:', JSON.stringify(result, null, 2));
    return;
  }

  const now = Date.now();
  const days = Number(args.days || 30);
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error(`Invalid --days value: ${args.days}`);
  }

  const startTime = parseTime(args.start, false) || (now - days * 24 * 60 * 60 * 1000);
  const endTime = parseTime(args.end, true) || now;

  if (endTime < startTime) {
    throw new Error('--end must be greater than or equal to --start');
  }

  const updateExisting = Boolean(args['update-existing']);
  console.log(`[SCRIPT] Syncing DingTalk data: ${new Date(startTime).toISOString()} ~ ${new Date(endTime).toISOString()}, updateExisting=${updateExisting}`);
  const result = await syncDingtalkData(startTime, endTime, { updateExisting });
  console.log('[SCRIPT] Sync result:', JSON.stringify(result, null, 2));
}

try {
  await main();
} catch (error) {
  console.error('[SCRIPT] DingTalk sync script failed:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exitCode = 1;
} finally {
  await pool.end();
}
