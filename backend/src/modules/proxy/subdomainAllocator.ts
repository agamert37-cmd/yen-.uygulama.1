import { projectsRepo } from '../../db/repositories/projectsRepo';

// DNS label: 1-63 chars, lowercase alphanumeric, hyphens only between alnums.
const SUBDOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

const RESERVED_SUBDOMAINS = new Set([
  'www',
  'api',
  'app',
  'admin',
  'panel',
  'mail',
  'ftp',
  'ssh',
  'root',
  'localhost',
]);

export function isValidSubdomainFormat(value: string): boolean {
  return SUBDOMAIN_PATTERN.test(value) && !RESERVED_SUBDOMAINS.has(value);
}

/**
 * Finds a free subdomain starting from `base`, appending -2, -3, ... on
 * collision - mirrors workspaceManager.ts's uniqueSlug(). excludeProjectId
 * lets a project "collide" with its own already-published subdomain
 * without incrementing, so re-publishing is idempotent.
 */
export function uniqueSubdomain(base: string, excludeProjectId: string): string {
  let candidate = base;
  let suffix = 2;
  for (;;) {
    const owner = projectsRepo.findBySubdomain(candidate);
    if (!owner || owner.id === excludeProjectId) return candidate;
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
}
