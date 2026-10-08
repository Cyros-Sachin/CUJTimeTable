import mysql from 'mysql2/promise';
import { config } from './config.js';
import { logger } from './logger.js';

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  user: config.db.user,
  password: config.db.password,
  charset: 'utf8mb4',
  timezone: '+05:30',
  dateStrings: true,
  namedPlaceholders: true,
  connectionLimit: 10,
  waitForConnections: true,
});

pool.on('connection', (conn) => {
  conn.query("SET time_zone='+05:30'");
});

export async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

export async function waitForDb(maxAttempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const conn = await pool.getConnection();
      await conn.query('SELECT 1');
      conn.release();
      logger.info('Database connection established');
      return;
    } catch (err) {
      logger.warn({ attempt, err: err.message }, 'Database not ready, retrying...');
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error('Could not connect to the database after multiple attempts');
}
