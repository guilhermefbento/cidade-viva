import { readFileSync } from 'node:fs';
const pointer = new URL('../cidade-viva.local', import.meta.url);
let configPath;
try {
  configPath = readFileSync(pointer, 'utf8').trim();
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (configPath) process.loadEnvFile(configPath);
