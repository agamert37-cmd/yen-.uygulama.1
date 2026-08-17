import path from 'node:path';
import { HttpError } from '../middleware/errorHandler';

/**
 * Resolves `userPath` against `root` and guarantees the result stays inside
 * `root`. Shared by the file manager and workspace/archive-import code -
 * every place that turns user-controlled input into a filesystem path
 * should go through this rather than trusting path.join/resolve alone.
 */
export function resolveWithinRoot(root: string, userPath: string): string {
  if (userPath.includes('\0')) {
    throw new HttpError(400, 'Invalid path');
  }
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, userPath);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new HttpError(400, 'Path escapes the allowed root directory');
  }
  return target;
}
