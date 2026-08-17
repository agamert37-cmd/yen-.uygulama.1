import type { Request } from 'express';
import { HttpError } from '../middleware/errorHandler';

/**
 * Express 5's ParamsDictionary allows `string | string[]` per key (repeated
 * matches / parameter pollution), and our tsconfig's noUncheckedIndexedAccess
 * adds `| undefined`. Route params that flow into DB lookups or filesystem
 * paths should always be a single defined string, so validate that here
 * once instead of trusting `req.params[name]` at every call site.
 */
export function requireParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpError(400, `Missing or invalid path parameter: ${name}`);
  }
  return value;
}
