import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '..', '.env') });
const { query, pool } = await import('../db/index.js');
const { hashPassword, AUTH_ROLES } = await import('../services/auth.js');

function arg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : '';
}

const username = arg('username').trim();
const role = arg('role').trim();
const departmentId = arg('department-id').trim() || null;
const departmentName = arg('department-name').trim() || null;
const password = arg('password') || process.env.AUTH_PASSWORD || '';

if (!username || !password || !Object.values(AUTH_ROLES).includes(role)) {
  console.error('用法: node scripts/create-user.js --username=alice --role=department_supervisor --department-id=123 --password=...');
  console.error('也可以通过 AUTH_PASSWORD 环境变量传入密码。');
  process.exitCode = 1;
} else if (role === AUTH_ROLES.DEPARTMENT_SUPERVISOR && !departmentId) {
  console.error('部门主管必须提供 --department-id。');
  process.exitCode = 1;
} else {
  try {
    await query(
      `INSERT INTO budget_users (username, password_hash, role, department_id, department_name_snapshot)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (username) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         role = EXCLUDED.role,
         department_id = EXCLUDED.department_id,
         department_name_snapshot = EXCLUDED.department_name_snapshot,
         active = true,
         updated_at = CURRENT_TIMESTAMP`,
      [username, hashPassword(password), role, departmentId, departmentName]
    );
    console.log(`用户 ${username} 已创建或更新。`);
  } finally {
    await pool.end();
  }
}
