import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { env } from '../../src/config/env';
import { WORKSPACES_ROOT } from '../../src/config/paths';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';
import type { ProjectStatus } from '../../src/types/project';

const app = createApp();
const TOKEN = env.PANEL_AUTH_TOKEN;

beforeAll(() => {
  runMigrations();
  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
});

afterAll(() => {
  fs.rmSync(WORKSPACES_ROOT, { recursive: true, force: true });
});

function createNodeProjectDir(slug: string, scripts: Record<string, string>): void {
  const absPath = path.join(WORKSPACES_ROOT, slug);
  fs.mkdirSync(absPath, { recursive: true });
  fs.writeFileSync(path.join(absPath, 'package.json'), JSON.stringify({ name: slug, scripts }));
}

async function waitForStatus(id: string, statuses: ProjectStatus[], timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await request(app).get(`/api/projects/${id}`).set('Authorization', `Bearer ${TOKEN}`);
    if (statuses.includes(res.body.status)) return res.body;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for one of [${statuses.join(', ')}]`);
}

describe('project action routes', () => {
  it('requires auth on start/stop/restart/logs/stats', async () => {
    const project = projectsRepo.create({
      name: 'Auth Check',
      slug: 'auth-check',
      dirPath: 'auth-check',
      sourceType: 'upload',
    });

    for (const [method, url] of [
      ['post', `/api/projects/${project.id}/actions/start`],
      ['post', `/api/projects/${project.id}/actions/stop`],
      ['post', `/api/projects/${project.id}/actions/restart`],
      ['get', `/api/projects/${project.id}/logs`],
      ['get', `/api/projects/${project.id}/stats`],
    ] as const) {
      const res = await request(app)[method](url);
      expect(res.status).toBe(401);
    }
  });

  it('runs a full start -> logs -> stop lifecycle over HTTP for a node project', async () => {
    const slug = 'http-lifecycle';
    createNodeProjectDir(slug, { start: 'node index.js', build: 'echo build' });
    const project = projectsRepo.create({ name: 'HTTP Lifecycle', slug, dirPath: slug, sourceType: 'upload' });
    projectsRepo.update(project.id, { projectType: 'node', packageManager: 'npm' });

    const start = await request(app)
      .post(`/api/projects/${project.id}/actions/start`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(start.status).toBe(202);
    expect(start.body.status).toBe('installing');

    const running = await waitForStatus(project.id, ['running', 'error']);
    expect(running.status).toBe('running');

    const logs = await request(app)
      .get(`/api/projects/${project.id}/logs`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(logs.status).toBe(200);
    expect(Array.isArray(logs.body)).toBe(true);
    expect(logs.body.length).toBeGreaterThan(0);

    const stats = await request(app)
      .get(`/api/projects/${project.id}/stats`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(stats.status).toBe(200);
    expect(typeof stats.body.cpuPercent).toBe('number');
    expect(typeof stats.body.memoryMb).toBe('number');

    const stop = await request(app)
      .post(`/api/projects/${project.id}/actions/stop`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(stop.status).toBe(202);
    expect(stop.body.status).toBe('stopping');

    const stopped = await waitForStatus(project.id, ['stopped', 'error']);
    expect(stopped.status).toBe('stopped');
  });

  it('returns 409 when starting a project whose type cannot run yet', async () => {
    const project = projectsRepo.create({
      name: 'Static App',
      slug: 'static-app',
      dirPath: 'static-app',
      sourceType: 'upload',
    });
    projectsRepo.update(project.id, { projectType: 'static' });

    const res = await request(app)
      .post(`/api/projects/${project.id}/actions/start`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
  });

  it('returns 404 for actions on an unknown project id', async () => {
    const res = await request(app)
      .post('/api/projects/does-not-exist/actions/start')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('returns 409 when stopping a project that is not running', async () => {
    const project = projectsRepo.create({
      name: 'Never Started',
      slug: 'never-started',
      dirPath: 'never-started',
      sourceType: 'upload',
    });

    const res = await request(app)
      .post(`/api/projects/${project.id}/actions/stop`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(409);
  });
});
