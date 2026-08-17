import fs from 'node:fs';
import path from 'node:path';
import { env } from './env';

export const WORKSPACES_ROOT = path.resolve(process.cwd(), env.WORKSPACES_ROOT);

// ':memory:' is a special better-sqlite3/SQLite identifier, not a real path - keep it literal.
export const DB_PATH = env.DB_PATH === ':memory:' ? env.DB_PATH : path.resolve(process.cwd(), env.DB_PATH);

export function ensureDirectories(): void {
  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });
  if (DB_PATH !== ':memory:') {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
}
