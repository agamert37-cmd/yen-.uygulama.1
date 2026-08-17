import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { env } from '../../src/config/env';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';

const app = createApp();
const TOKEN = env.PANEL_AUTH_TOKEN;

beforeAll(() => {
  runMigrations();
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
});

// PANEL_DOMAIN is intentionally left unset (setupEnv.ts's default) - covers
// the "publishing disabled server-side" path in isolation from the
// PANEL_DOMAIN-enabled suite in publish.routes.test.ts.
describe('POST /api/projects/:id/publish (PANEL_DOMAIN unset)', () => {
  it('400s with a clear message instead of attempting to publish', async () => {
    const project = projectsRepo.create({ name: 'Demo', slug: 'demo', dirPath: 'demo', sourceType: 'upload' });
    projectsRepo.update(project.id, { status: 'running', port: 3000 });

    const res = await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/PANEL_DOMAIN/);
  });
});

describe('GET /api/health (PANEL_DOMAIN unset)', () => {
  it('reports panelDomain as null', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.panelDomain).toBeNull();
  });
});
