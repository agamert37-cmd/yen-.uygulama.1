import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
});

describe('projectsRepo', () => {
  it('creates a project with sane defaults and finds it by id and slug', () => {
    const created = projectsRepo.create({
      name: 'Demo App',
      slug: 'demo-app',
      dirPath: '/workspaces/demo-app',
      sourceType: 'upload',
    });

    expect(created.id).toBeTruthy();
    expect(created.status).toBe('idle');
    expect(created.projectType).toBe('unknown');
    expect(created.hasComposeFile).toBe(false);
    expect(created.envVars).toEqual({});

    expect(projectsRepo.findById(created.id)?.name).toBe('Demo App');
    expect(projectsRepo.findBySlug('demo-app')?.id).toBe(created.id);
  });

  it('lists all projects', () => {
    projectsRepo.create({ name: 'A', slug: 'a', dirPath: '/w/a', sourceType: 'upload' });
    projectsRepo.create({
      name: 'B',
      slug: 'b',
      dirPath: '/w/b',
      sourceType: 'git',
      sourceRef: 'https://example.com/b.git',
    });

    expect(projectsRepo.findAll()).toHaveLength(2);
  });

  it('updates fields including nested envVars', () => {
    const created = projectsRepo.create({ name: 'C', slug: 'c', dirPath: '/w/c', sourceType: 'upload' });

    const updated = projectsRepo.update(created.id, {
      port: 3005,
      envVars: { DATABASE_URL: 'postgres://x' },
      status: 'running',
      projectType: 'node',
      packageManager: 'pnpm',
    });

    expect(updated?.port).toBe(3005);
    expect(updated?.envVars).toEqual({ DATABASE_URL: 'postgres://x' });
    expect(updated?.status).toBe('running');
    expect(updated?.projectType).toBe('node');
    expect(updated?.packageManager).toBe('pnpm');
    // untouched fields survive the partial update
    expect(updated?.name).toBe('C');
  });

  it('returns undefined when updating or reading a missing project', () => {
    expect(projectsRepo.update('missing-id', { port: 1 })).toBeUndefined();
    expect(projectsRepo.findById('missing-id')).toBeUndefined();
  });

  it('removes a project', () => {
    const created = projectsRepo.create({ name: 'D', slug: 'd', dirPath: '/w/d', sourceType: 'upload' });
    expect(projectsRepo.remove(created.id)).toBe(true);
    expect(projectsRepo.findById(created.id)).toBeUndefined();
    expect(projectsRepo.remove(created.id)).toBe(false);
  });

  it('keeps only the most recent 50 deploy events per project', () => {
    const created = projectsRepo.create({ name: 'E', slug: 'e', dirPath: '/w/e', sourceType: 'upload' });

    for (let i = 0; i < 55; i += 1) {
      projectsRepo.addDeployEvent(created.id, 'building', `line ${i}`);
    }

    const events = projectsRepo.listDeployEvents(created.id);
    expect(events).toHaveLength(50);
    expect(events[0]?.message).toBe('line 54');
    expect(events[49]?.message).toBe('line 5');
  });
});
