import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

let cachedSecret = null;

export async function getJwtSecret() {
  if (cachedSecret) return cachedSecret;
  if (config.jwtSecret) {
    cachedSecret = config.jwtSecret;
    return cachedSecret;
  }
  const [rows] = await pool.execute("SELECT v FROM settings WHERE k = 'jwt_secret' LIMIT 1");
  if (rows[0]?.v) {
    cachedSecret = rows[0].v;
    return cachedSecret;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  await pool.execute(
    "INSERT INTO settings (k, v) VALUES ('jwt_secret', :v) ON DUPLICATE KEY UPDATE v = VALUES(v)",
    { v: generated },
  );
  cachedSecret = generated;
  return cachedSecret;
}

const DEMO_DEPARTMENTS = [
  { code: 'CMB', email: 'coordinator.cmb@cuj.local', name: 'CMB Coordinator' },
  { code: 'CSIT', email: 'coordinator.csit@cuj.local', name: 'CSIT Coordinator' },
];

export async function runSeed() {
  await getJwtSecret();

  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM users');
  if (count > 0) {
    logger.info('Users already present, skipping seed');
    return;
  }

  const passwordHash = await bcrypt.hash(config.admin.password, 11);
  await pool.execute(
    `INSERT INTO users (name, email, password_hash, role, department_id, must_change_password)
     VALUES (:name, :email, :hash, 'EXAM_CELL', NULL, 1)`,
    { name: config.admin.name, email: config.admin.email, hash: passwordHash },
  );
  logger.info({ email: config.admin.email }, 'Seeded EXAM_CELL admin user');

  if (config.seedDemoUsers) {
    for (const demo of DEMO_DEPARTMENTS) {
      const [deptRows] = await pool.execute('SELECT id FROM departments WHERE code = :code LIMIT 1', { code: demo.code });
      if (!deptRows[0]) continue;
      const hash = await bcrypt.hash(config.admin.password, 11);
      await pool.execute(
        `INSERT IGNORE INTO users (name, email, password_hash, role, department_id, must_change_password)
         VALUES (:name, :email, :hash, 'DEPT_COORDINATOR', :deptId, 1)`,
        { name: demo.name, email: demo.email, hash, deptId: deptRows[0].id },
      );
    }
    logger.info('Seeded demo department coordinators');
  }
}
