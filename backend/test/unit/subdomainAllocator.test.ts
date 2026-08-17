import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';
import { isValidSubdomainFormat, uniqueSubdomain } from '../../src/modules/proxy/subdomainAllocator';

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
});

describe('isValidSubdomainFormat', () => {
  it('accepts lowercase alphanumeric labels with internal hyphens', () => {
    expect(isValidSubdomainFormat('demo')).toBe(true);
    expect(isValidSubdomainFormat('my-app-2')).toBe(true);
    expect(isValidSubdomainFormat('a')).toBe(true);
  });

  it('rejects invalid DNS label shapes', () => {
    expect(isValidSubdomainFormat('')).toBe(false);
    expect(isValidSubdomainFormat('-leading')).toBe(false);
    expect(isValidSubdomainFormat('trailing-')).toBe(false);
    expect(isValidSubdomainFormat('Has-Upper')).toBe(false);
    expect(isValidSubdomainFormat('has_underscore')).toBe(false);
    expect(isValidSubdomainFormat('has.dot')).toBe(false);
    expect(isValidSubdomainFormat('a'.repeat(64))).toBe(false);
  });

  it('rejects reserved names', () => {
    expect(isValidSubdomainFormat('www')).toBe(false);
    expect(isValidSubdomainFormat('api')).toBe(false);
    expect(isValidSubdomainFormat('panel')).toBe(false);
  });
});

describe('uniqueSubdomain', () => {
  it('returns the base candidate when free', () => {
    const project = projectsRepo.create({ name: 'Demo', slug: 'demo', dirPath: '/w/demo', sourceType: 'upload' });
    expect(uniqueSubdomain('demo', project.id)).toBe('demo');
  });

  it('appends -2, -3 on collision with other projects', () => {
    const a = projectsRepo.create({ name: 'A', slug: 'a', dirPath: '/w/a', sourceType: 'upload' });
    const b = projectsRepo.create({ name: 'B', slug: 'b', dirPath: '/w/b', sourceType: 'upload' });
    const c = projectsRepo.create({ name: 'C', slug: 'c', dirPath: '/w/c', sourceType: 'upload' });
    projectsRepo.update(a.id, { subdomain: 'demo' });
    projectsRepo.update(b.id, { subdomain: 'demo-2' });

    expect(uniqueSubdomain('demo', c.id)).toBe('demo-3');
  });

  it('lets a project "collide" with its own subdomain without incrementing (idempotent re-publish)', () => {
    const project = projectsRepo.create({ name: 'Demo', slug: 'demo', dirPath: '/w/demo', sourceType: 'upload' });
    projectsRepo.update(project.id, { subdomain: 'demo' });

    expect(uniqueSubdomain('demo', project.id)).toBe('demo');
  });
});
