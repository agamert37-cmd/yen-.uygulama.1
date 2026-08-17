import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { requireParam } from '../utils/params';
import { projectsRepo } from '../db/repositories/projectsRepo';
import { projectAbsPath } from '../modules/workspace/workspaceManager';
import { deletePath, listDirectory, readFileContent, writeFileContent } from '../modules/files/fileManager';

export const filesRouter = Router();

function getProjectRoot(id: string): string {
  const project = projectsRepo.findById(id);
  if (!project) throw new HttpError(404, 'Project not found');
  return projectAbsPath(project.dirPath);
}

const pathQuerySchema = z.object({ path: z.string().default('.') });

filesRouter.get(
  '/:id/files',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const root = getProjectRoot(id);
    const { path: relPath } = pathQuerySchema.parse(req.query);
    res.json(listDirectory(root, relPath));
  }),
);

filesRouter.get(
  '/:id/files/content',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const root = getProjectRoot(id);
    const { path: relPath } = pathQuerySchema.parse(req.query);
    res.json({ path: relPath, content: readFileContent(root, relPath) });
  }),
);

const writeBodySchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

filesRouter.put(
  '/:id/files/content',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const root = getProjectRoot(id);
    const { path: relPath, content } = writeBodySchema.parse(req.body);
    writeFileContent(root, relPath, content);
    res.status(204).send();
  }),
);

filesRouter.delete(
  '/:id/files',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const root = getProjectRoot(id);
    const { path: relPath } = pathQuerySchema.parse(req.query);
    deletePath(root, relPath);
    res.status(204).send();
  }),
);
