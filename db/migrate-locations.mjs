import '../server/config.js';
import mysql from 'mysql2/promise';
import { migrateLocations } from '../server/features.js';

const { DB_HOST, DB_PORT, DB_NAME, DB_MIGRATION_USER, DB_MIGRATION_PASSWORD } = process.env;
if (!DB_MIGRATION_USER || DB_MIGRATION_PASSWORD === undefined) {
  throw new Error('Configure DB_MIGRATION_USER e DB_MIGRATION_PASSWORD para executar a migração.');
}
const db = mysql.createPool({
  host: DB_HOST || '127.0.0.1',
  port: Number(DB_PORT || 3306),
  database: DB_NAME || 'cidade_viva',
  user: DB_MIGRATION_USER,
  password: DB_MIGRATION_PASSWORD,
});
try {
  await migrateLocations(db);
  console.log('Migração de locais concluída.');
} finally {
  await db.end();
}