import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from '../../middleware/errorHandler';
import { resolveWithinRoot } from '../../utils/safePath';

export interface DirEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

const MAX_EDITABLE_FILE_BYTES = 2 * 1024 * 1024; // 2MB

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.tgz', '.7z', '.rar',
  '.mp3', '.mp4', '.mov', '.avi', '.wav', '.ogg',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.so', '.dylib', '.dll', '.exe', '.bin', '.node',
  '.sqlite', '.sqlite-journal', '.db',
]);

export function listDirectory(root: string, relativePath: string): DirEntry[] {
  const target = resolveWithinRoot(root, relativePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new HttpError(404, 'Path not found');
  }
  if (!stat.isDirectory()) throw new HttpError(400, 'Path is not a directory');

  return fs
    .readdirSync(target, { withFileTypes: true })
    .map((entry): DirEntry => {
      const entryStat = fs.statSync(path.join(target, entry.name));
      return {
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        size: entryStat.size,
        modifiedAt: entryStat.mtime.toISOString(),
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function readFileContent(root: string, relativePath: string): string {
  const target = resolveWithinRoot(root, relativePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new HttpError(404, 'File not found');
  }
  if (!stat.isFile()) throw new HttpError(400, 'Path is not a file');
  if (stat.size > MAX_EDITABLE_FILE_BYTES) {
    throw new HttpError(400, `File is too large to open in the editor (max ${MAX_EDITABLE_FILE_BYTES} bytes)`);
  }
  if (BINARY_EXTENSIONS.has(path.extname(target).toLowerCase())) {
    throw new HttpError(400, 'Binary files cannot be opened in the editor');
  }
  return fs.readFileSync(target, 'utf8');
}

export function writeFileContent(root: string, relativePath: string, content: string): void {
  if (Buffer.byteLength(content, 'utf8') > MAX_EDITABLE_FILE_BYTES) {
    throw new HttpError(400, `Content is too large to save (max ${MAX_EDITABLE_FILE_BYTES} bytes)`);
  }
  const target = resolveWithinRoot(root, relativePath);
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
    throw new HttpError(400, 'Path is a directory, not a file');
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

export function deletePath(root: string, relativePath: string): void {
  const target = resolveWithinRoot(root, relativePath);
  if (target === path.resolve(root)) {
    throw new HttpError(400, 'Cannot delete the project root directory');
  }
  if (!fs.existsSync(target)) {
    throw new HttpError(404, 'Path not found');
  }
  fs.rmSync(target, { recursive: true, force: true });
}

/**
 * The Env tab's save action writes here too, so the on-disk `.env` (what
 * Docker Compose/PM2 actually read) stays in sync with the DB's env_vars
 * cache - the DB column is only a fast-render cache for the project list.
 */
export function writeEnvFile(root: string, envVars: Record<string, string>): void {
  const resolvedRoot = path.resolve(root);
  fs.mkdirSync(resolvedRoot, { recursive: true });
  const lines = Object.entries(envVars).map(([key, value]) => `${key}=${value}`);
  fs.writeFileSync(path.join(resolvedRoot, '.env'), `${lines.join('\n')}\n`);
}
