import fs from 'node:fs';
import path from 'node:path';
import { WORKSPACES_ROOT } from '../../config/paths';
import { projectsRepo } from '../../db/repositories/projectsRepo';
import { slugify } from '../../utils/slug';

function uniqueSlug(name: string): string {
  const base = slugify(name);
  let candidate = base;
  let suffix = 2;
  while (projectsRepo.findBySlug(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export interface AllocatedProjectDir {
  slug: string;
  /** Stored in the DB - relative to WORKSPACES_ROOT, so it stays valid if the root ever moves. */
  dirPath: string;
  /** Absolute path on disk, for immediate use (extraction, git clone, etc). */
  absPath: string;
}

export function allocateProjectDir(name: string): AllocatedProjectDir {
  const slug = uniqueSlug(name);
  const absPath = path.join(WORKSPACES_ROOT, slug);
  fs.mkdirSync(absPath, { recursive: true });
  return { slug, dirPath: slug, absPath };
}

export function projectAbsPath(dirPath: string): string {
  return path.join(WORKSPACES_ROOT, dirPath);
}

export function removeProjectDir(dirPath: string): void {
  fs.rmSync(projectAbsPath(dirPath), { recursive: true, force: true });
}
