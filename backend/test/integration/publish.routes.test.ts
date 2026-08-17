import '../helpers/setPanelDomain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { env } from '../../src/config/env';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';
import { WORKSPACES_ROOT } from '../../src/config/paths';
import fs from 'node:fs';

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

function runningProject(overrides: { slug?: string; port?: number | null } = {}) {
  const slug = overrides.slug ?? 'demo-app';
  const project = projectsRepo.create({ name: `Demo App (${slug})`, slug, dirPath: slug, sourceType: 'upload' });
  return projectsRepo.update(project.id, {
    status: 'running',
    port: overrides.port === undefined ? 3000 : overrides.port,
  })!;
}

describe('POST /api/projects/:id/publish', () => {
  it('requires auth', async () => {
    const project = runningProject();
    const res = await request(app).post(`/api/projects/${project.id}/publish`);
    expect(res.status).toBe(401);
  });

  it('404s for an unknown project', async () => {
    const res = await request(app)
      .post('/api/projects/does-not-exist/publish')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });

  it('409s when the project is not running', async () => {
    const project = projectsRepo.create({ name: 'Idle', slug: 'idle', dirPath: 'idle', sourceType: 'upload' });
    const res = await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(409);
  });

  it('400s when the project has no port configured', async () => {
    const project = runningProject({ port: null });
    const res = await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
  });

  it('auto-derives a subdomain from the slug when none is given', async () => {
    const project = runningProject({ slug: 'my-cool-app' });
    const res = await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.project.subdomain).toBe('my-cool-app');
    expect(res.body.url).toBe('https://my-cool-app.panel.test.local');
  });

  it('accepts and validates a custom subdomain', async () => {
    const project = runningProject();
    const res = await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ subdomain: 'Custom-Name' }); // gets lowercased by the schema
    expect(res.status).toBe(200);
    expect(res.body.project.subdomain).toBe('custom-name');
  });

  it('rejects an invalid or reserved subdomain', async () => {
    const project = runningProject();
    const res = await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ subdomain: 'www' });
    expect(res.status).toBe(400);
  });

  it('409s when the subdomain is already used by a different project', async () => {
    const first = runningProject({ slug: 'first' });
    await request(app)
      .post(`/api/projects/${first.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ subdomain: 'taken' });

    const second = runningProject({ slug: 'second' });
    const res = await request(app)
      .post(`/api/projects/${second.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ subdomain: 'taken' });
    expect(res.status).toBe(409);
  });

  it('is idempotent when re-publishing the same project with the same subdomain', async () => {
    const project = runningProject();
    const first = await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ subdomain: 'stable' });
    const second = await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ subdomain: 'stable' });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.project.subdomain).toBe('stable');
  });
});

describe('DELETE /api/projects/:id/publish', () => {
  it('clears the subdomain and is idempotent', async () => {
    const project = runningProject();
    await request(app)
      .post(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ subdomain: 'to-remove' });

    const first = await request(app)
      .delete(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(first.status).toBe(200);
    expect(first.body.subdomain).toBeNull();

    const second = await request(app)
      .delete(`/api/projects/${project.id}/publish`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(second.status).toBe(200);
    expect(second.body.subdomain).toBeNull();
  });

  it('requires auth', async () => {
    const project = runningProject();
    const res = await request(app).delete(`/api/projects/${project.id}/publish`);
    expect(res.status).toBe(401);
  });
});
