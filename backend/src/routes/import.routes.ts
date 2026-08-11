import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { asyncHandler } from '../middleware/asyncHandler';
import { HttpError } from '../middleware/errorHandler';
import { projectsRepo } from '../db/repositories/projectsRepo';
import type { Project, SourceType } from '../types/project';
import { detectProject } from '../modules/detection/detectionEngine';
import { allocateProjectDir, removeProjectDir } from '../modules/workspace/workspaceManager';
import { extractArchive } from '../modules/workspace/importUpload';
import { cloneRepo } from '../modules/workspace/importGit';

export const importRouter = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      // Never splice the raw original filename into a disk path - only pull
      // a short, allowlisted extension out of it for readability.
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
      const safeExt = ext.length > 0 && ext.length <= 10 ? ext : '';
      cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
    },
  }),
  limits: { fileSize: 500 * 1024 * 1024 },
});

function runDetectionAndPersist(projectId: string, absPath: string): void {
  const result = detectProject(absPath);
  projectsRepo.update(projectId, {
    projectType: result.projectType,
    packageManager: result.packageManager,
    hasComposeFile: result.hasComposeFile,
    status: 'idle',
    statusMessage: result.message,
  });
  projectsRepo.addDeployEvent(projectId, 'detecting', result.message);
}

async function createProjectFromSource(
  name: string,
  sourceType: SourceType,
  sourceRef: string | null,
  acquireContent: (absPath: string) => Promise<void>,
): Promise<Project> {
  if (projectsRepo.findAll().some((existing) => existing.name === name)) {
    throw new HttpError(409, 'A project with this name already exists');
  }

  const { slug, dirPath, absPath } = allocateProjectDir(name);
  const project = projectsRepo.create({ name, slug, dirPath, sourceType, sourceRef });

  try {
    projectsRepo.update(project.id, { status: 'importing' });
    projectsRepo.addDeployEvent(project.id, 'importing');
    await acquireContent(absPath);
    projectsRepo.update(project.id, { status: 'detecting' });
    runDetectionAndPersist(project.id, absPath);
  } catch (err) {
    removeProjectDir(dirPath);
    projectsRepo.remove(project.id);
    throw err;
  }

  const created = projectsRepo.findById(project.id);
  if (!created) throw new HttpError(500, 'Project disappeared right after import');
  return created;
}

const uploadBodySchema = z.object({
  name: z.string().min(1).max(200),
});

importRouter.post(
  '/upload',
  upload.single('archive'),
  asyncHandler(async (req, res) => {
    const { name } = uploadBodySchema.parse(req.body);
    const file = req.file;
    if (!file) throw new HttpError(400, 'No archive file uploaded (field name: "archive")');

    try {
      const project = await createProjectFromSource(name, 'upload', null, (absPath) =>
        extractArchive(file.path, file.originalname, absPath),
      );
      res.status(201).json(project);
    } finally {
      fs.rm(file.path, { force: true }, () => {});
    }
  }),
);

const gitBodySchema = z.object({
  name: z.string().min(1).max(200),
  repoUrl: z.string().min(1).max(2000),
});

importRouter.post(
  '/git',
  asyncHandler(async (req, res) => {
    const { name, repoUrl } = gitBodySchema.parse(req.body);
    const project = await createProjectFromSource(name, 'git', repoUrl, (absPath) =>
      cloneRepo(repoUrl, absPath),
    );
    res.status(201).json(project);
  }),
);
