import { Router } from 'express';
import { env } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString(), panelDomain: env.PANEL_DOMAIN ?? null });
});
