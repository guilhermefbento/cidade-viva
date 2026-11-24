import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

export const appRoot = fileURLToPath(new URL('../', import.meta.url));
const derive = promisify(scrypt);

export async function openDatabase() {
  if (!process.env.DB_PASSWORD || !process.env.DB_USER) {
    throw new Error('Configure DB_USER e DB_PASSWORD no arquivo .env.');
  }
  const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'cidade_viva',
    charset: 'utf8mb4',
    timezone: 'Z',
    connectionLimit: 8,
  });
  try {
    const schema = await readFile(resolve(appRoot, 'db/schema.sql'), 'utf8');
    for (const statement of schema.split(';').map(sql => sql.trim()).filter(Boolean)) {
      await pool.query(statement);
    }
    return pool;
  } catch (error) {
    await pool.end();
    throw error;
  }
}

export async function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const key = await derive(password, salt, 64);
  return salt + ':' + key.toString('hex');
}
export async function checkPassword(password, hash) {
  const salt = hash ? hash.split(':')[0] : 'invalid-account';
  const actual = await hashPassword(password, salt);
  return Boolean(hash && timingSafeEqual(Buffer.from(hash), Buffer.from(actual)));
}
export function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}
export async function transaction(pool, run) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await run(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
