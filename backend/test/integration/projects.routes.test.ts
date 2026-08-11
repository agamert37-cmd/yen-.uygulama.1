import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';
import { env } from '../../src/config/env';

const app = createApp();
const TOKEN = env.PANEL_AUTH_TOKEN;

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
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

  it('refuses to delete a running project', async () => {
    const project = projectsRepo.create({
      name: 'Running App',
      slug: 'running-app',
      dirPath: '/workspaces/running-app',
      sourceType: 'upload',
    });
    projectsRepo.update(project.id, { status: 'running' });

    const res = await request(app)
      .delete(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(409);
  });
});
