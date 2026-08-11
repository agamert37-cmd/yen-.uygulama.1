import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { projectsRepo } from '../db/repositories/projectsRepo';
import { requireParam } from '../utils/params';
import { detectProject } from '../modules/detection/detectionEngine';
import { projectAbsPath, removeProjectDir } from '../modules/workspace/workspaceManager';

export const projectsRouter = Router();

projectsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(projectsRepo.findAll());
  }),
);

projectsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = projectsRepo.findById(id);
    if (!project) throw new HttpError(404, 'Project not found');
    res.json(project);
  }),
);

projectsRouter.get(
  '/:id/events',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = projectsRepo.findById(id);
    if (!project) throw new HttpError(404, 'Project not found');
    res.json(projectsRepo.listDeployEvents(id));
  }),
);

projectsRouter.post(
  '/:id/detect',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const existing = projectsRepo.findById(id);
    if (!existing) throw new HttpError(404, 'Project not found');

    const result = detectProject(projectAbsPath(existing.dirPath));
    const updated = projectsRepo.update(id, {
      projectType: result.projectType,
      packageManager: result.packageManager,
      hasComposeFile: result.hasComposeFile,
      statusMessage: result.message,
    });
    projectsRepo.addDeployEvent(id, 'detecting', result.message);
    res.json(updated);
  }),
);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  port: z.number().int().min(1).max(65535).nullable().optional(),
  envVars: z.record(z.string(), z.string()).optional(),
});

projectsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const existing = projectsRepo.findById(id);
    if (!existing) throw new HttpError(404, 'Project not found');
    const patch = patchSchema.parse(req.body);
    const updated = projectsRepo.update(id, patch);
    res.json(updated);
  }),
);

projectsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const existing = projectsRepo.findById(id);
    if (!existing) throw new HttpError(404, 'Project not found');
    if (existing.status === 'running' || existing.status === 'starting') {
      throw new HttpError(409, 'Stop the project before deleting it');
    }
    removeProjectDir(existing.dirPath);
    projectsRepo.remove(id);
    res.status(204).send();
  }),
);
