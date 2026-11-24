import './config.js';
import mysql from 'mysql2/promise';
import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { appRoot } from './store.js';

const { MYSQL_HOME, MYSQL_DATA, DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, PORT } = process.env;
const local = DB_HOST === '127.0.0.1' && MYSQL_HOME && MYSQL_DATA;
async function check() {
  const connection = await mysql.createConnection({
    host: DB_HOST || '127.0.0.1', port: Number(DB_PORT || 3306),
    user: DB_USER, password: DB_PASSWORD, database: DB_NAME || 'cidade_viva',
    connectTimeout: 1500,
  });
  await connection.end();
}
try {
  await check();
} catch (error) {
  if (error.code !== 'ECONNREFUSED' || !local) throw error;
  const child = spawn(resolve(MYSQL_HOME, 'bin/mysqld.exe'), [
    '--no-defaults', '--basedir=' + MYSQL_HOME, '--datadir=' + MYSQL_DATA,
    '--port=' + DB_PORT, '--bind-address=127.0.0.1', '--mysqlx=OFF',
    '--log-error=' + resolve(dirname(MYSQL_DATA), 'mysql.log'),
  ], { detached: true, stdio: 'ignore', windowsHide: true });
  let failure;
  child.on('error', error => { failure = error; });
  child.unref();
  for (let attempt = 0; ; attempt++) {
    if (failure) throw failure;
    try { await check(); break; }
    catch (error) {
      if (attempt === 29 || error.code !== 'ECONNREFUSED') throw error;
      await wait(500);
    }
  }
}
const url = 'http://localhost:' + (PORT || 3333);
const running = await fetch(url + '/api/saude', { signal: AbortSignal.timeout(1000) })
  .then(async response => response.ok && (await response.json()).banco === 'MySQL')
  .catch(() => false);
if (!running) await import('./index.js');
if (process.platform === 'win32') {
  const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
    cwd: appRoot, detached: true, stdio: 'ignore', windowsHide: true,
  });
  browser.on('error', () => console.log('Abra ' + url + ' no navegador.'));
  browser.unref();
}

