import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { requireParam } from '../utils/params';
import { projectsRepo } from '../db/repositories/projectsRepo';
import { getDriver } from '../drivers';
import { getRecentLogs } from '../modules/lifecycle/logBuffer';
import { restartProject, startProject, stopProject } from '../modules/lifecycle/projectStateMachine';

export const actionsRouter = Router();

actionsRouter.post(
  '/:id/actions/start',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = await startProject(id);
    res.status(202).json(project);
  }),
);

actionsRouter.post(
  '/:id/actions/stop',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = await stopProject(id);
    res.status(202).json(project);
  }),
);

actionsRouter.post(
  '/:id/actions/restart',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = await restartProject(id);
    res.status(202).json(project);
  }),
);

const tailQuerySchema = z.object({
  tail: z.coerce.number().int().min(1).max(2000).optional(),
});

actionsRouter.get(
  '/:id/logs',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = projectsRepo.findById(id);
    if (!project) throw new HttpError(404, 'Project not found');
    const { tail } = tailQuerySchema.parse(req.query);
    res.json(getRecentLogs(id, tail ?? 200));
  }),
);

actionsRouter.get(
  '/:id/stats',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = projectsRepo.findById(id);
    if (!project) throw new HttpError(404, 'Project not found');
    const stats = await getDriver().getStats(project);
    res.json(stats ?? { cpuPercent: 0, memoryMb: 0 });
  }),
);
