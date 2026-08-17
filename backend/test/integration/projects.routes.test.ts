import fs from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';
import { env } from '../../src/config/env';
import { WORKSPACES_ROOT } from '../../src/config/paths';
import { BUSY_STATUSES } from '../../src/modules/lifecycle/projectStateMachine';
import { appendLog, getRecentLogs } from '../../src/modules/lifecycle/logBuffer';

const app = createApp();
const TOKEN = env.PANEL_AUTH_TOKEN;

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
});

afterAll(() => {
  // PATCH-ing envVars writes a real .env file (see writeEnvFile), so this
  // suite does touch disk despite otherwise being a DB/route-level test.
  fs.rmSync(WORKSPACES_ROOT, { recursive: true, force: true });
});

describe('GET /api/health', () => {
  it('responds without requiring auth', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('auth guard', () => {
  it('rejects requests with no bearer token', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('rejects requests with the wrong token', async () => {
    const res = await request(app).get('/api/projects').set('Authorization', 'Bearer wrong-token');
    expect(res.status).toBe(401);
  });
});

describe('/api/projects', () => {
  it('lists, reads, patches and deletes a project end to end', async () => {
    const project = projectsRepo.create({
      name: 'Integration App',
      slug: 'integration-app',
      dirPath: '/workspaces/integration-app',
      sourceType: 'upload',
    });

    const list = await request(app).get('/api/projects').set('Authorization', `Bearer ${TOKEN}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);

    const get = await request(app)
      .get(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(get.status).toBe(200);
    expect(get.body.name).toBe('Integration App');

    const patch = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ port: 3005, envVars: { FOO: 'bar' } });
    expect(patch.status).toBe(200);
    expect(patch.body.port).toBe(3005);
    expect(patch.body.envVars).toEqual({ FOO: 'bar' });

    const del = await request(app)
      .delete(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(del.status).toBe(204);

    const getAfterDelete = await request(app)
      .get(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(getAfterDelete.status).toBe(404);
  });

  it('404s for an unknown project id', async () => {
    const res = await request(app)
      .get('/api/projects/does-not-exist')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('rejects an out-of-range port in the patch body', async () => {
    const project = projectsRepo.create({
      name: 'Validate App',
      slug: 'validate-app',
      dirPath: '/workspaces/validate-app',
      sourceType: 'upload',
    });

    const res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ port: 99999 });
    expect(res.status).toBe(400);
  });

  it.each([...BUSY_STATUSES])('refuses to delete a project that is %s', async (status) => {
    const project = projectsRepo.create({
      name: `Busy App (${status})`,
      slug: `busy-app-${status}`,
      dirPath: `/workspaces/busy-app-${status}`,
      sourceType: 'upload',
    });
    projectsRepo.update(project.id, { status });

    const res = await request(app)
      .delete(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(409);
  });

  it('deletes an idle project and clears its log buffer', async () => {
    const project = projectsRepo.create({
      name: 'Idle App',
      slug: 'idle-app',
      dirPath: '/workspaces/idle-app',
      sourceType: 'upload',
    });
    appendLog(project.id, 'stdout', 'hello\n');
    expect(getRecentLogs(project.id)).toHaveLength(1);

    const res = await request(app)
      .delete(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(204);
    expect(getRecentLogs(project.id)).toEqual([]);
  });

  it('returns 409 when patching a project name to one that already exists', async () => {
    const first = projectsRepo.create({
      name: 'Taken Name',
      slug: 'taken-name',
      dirPath: '/workspaces/taken-name',
      sourceType: 'upload',
    });
    const second = projectsRepo.create({
      name: 'Other Name',
      slug: 'other-name',
      dirPath: '/workspaces/other-name',
      sourceType: 'upload',
    });

    const res = await request(app)
      .patch(`/api/projects/${second.id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: first.name });
    expect(res.status).toBe(409);
  });
});
