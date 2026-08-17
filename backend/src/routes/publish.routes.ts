import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { requireParam } from '../utils/params';
import { projectsRepo } from '../db/repositories/projectsRepo';
import { env } from '../config/env';
import { isValidSubdomainFormat, uniqueSubdomain } from '../modules/proxy/subdomainAllocator';

export const publishRouter = Router();

const publishBodySchema = z.object({
  subdomain: z.string().trim().toLowerCase().min(1).max(63).optional(),
});

publishRouter.post(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = projectsRepo.findById(id);
    if (!project) throw new HttpError(404, 'Project not found');
    if (!env.PANEL_DOMAIN) {
      throw new HttpError(400, 'PANEL_DOMAIN is not configured on this server - publishing is disabled');
    }
    if (project.status !== 'running') throw new HttpError(409, 'Project must be running to publish');
    if (!project.port) {
      throw new HttpError(400, 'Project has no port configured - set one on the Overview tab first');
    }

    const { subdomain: desired } = publishBodySchema.parse(req.body ?? {});

    let subdomain: string;
    if (desired) {
      if (!isValidSubdomainFormat(desired)) {
        throw new HttpError(
          400,
          'Subdomain must be 1-63 lowercase letters, digits or hyphens, and not a reserved name',
        );
      }
      const owner = projectsRepo.findBySubdomain(desired);
      if (owner && owner.id !== project.id) {
        throw new HttpError(409, `Subdomain "${desired}" is already in use`);
      }
      subdomain = desired;
    } else {
      subdomain = uniqueSubdomain(project.slug, project.id);
    }

    const updated = projectsRepo.update(id, { subdomain });
    if (!updated) throw new HttpError(404, 'Project not found');
    const url = `https://${subdomain}.${env.PANEL_DOMAIN}`;
    projectsRepo.addDeployEvent(id, 'published', url);

    res.json({ project: updated, url });
  }),
);

publishRouter.delete(
  '/:id/publish',
  asyncHandler(async (req, res) => {
    const id = requireParam(req, 'id');
    const project = projectsRepo.findById(id);
    if (!project) throw new HttpError(404, 'Project not found');
    const updated = projectsRepo.update(id, { subdomain: null });
    if (project.subdomain) projectsRepo.addDeployEvent(id, 'unpublished', project.subdomain);
    res.json(updated);
  }),
);
