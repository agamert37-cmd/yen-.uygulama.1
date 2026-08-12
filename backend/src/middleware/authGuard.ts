import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';
import { timingSafeEqualString } from '../utils/secureCompare';

/**
 * Single shared-secret gate for the whole /api surface (see plan: no
 * multi-user RBAC in MVP, just a bearer token so the panel isn't wide open
 * if it ever ends up reachable beyond localhost).
 */
export function authGuard(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme === 'Bearer' && token && timingSafeEqualString(token, env.PANEL_AUTH_TOKEN)) {
    next();
    return;
  }

  res.status(401).json({ error: 'Unauthorized' });
}
