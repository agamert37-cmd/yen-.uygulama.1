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

function createProjectWithFiles(slug: string, files: Record<string, string>) {
  const absPath = path.join(WORKSPACES_ROOT, slug);
  fs.mkdirSync(absPath, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(absPath, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
  return projectsRepo.create({ name: slug, slug, dirPath: slug, sourceType: 'upload' });
}

describe('file manager routes', () => {
  it('requires auth on list/read/write/delete', async () => {
    const project = createProjectWithFiles('auth-files', { 'a.txt': 'a' });

    for (const [method, url] of [
      ['get', `/api/projects/${project.id}/files`],
      ['get', `/api/projects/${project.id}/files/content?path=a.txt`],
      ['put', `/api/projects/${project.id}/files/content`],
      ['delete', `/api/projects/${project.id}/files?path=a.txt`],
    ] as const) {
      const res = await request(app)[method](url);
      expect(res.status).toBe(401);
    }
  });

  it('lists, reads, writes and deletes files end to end', async () => {
    const project = createProjectWithFiles('files-lifecycle', {
      'package.json': '{"name":"demo"}',
      'src/index.js': 'console.log(1)',
    });

    const list = await request(app)
      .get(`/api/projects/${project.id}/files`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(list.status).toBe(200);
    expect(list.body.map((e: { name: string }) => e.name)).toEqual(['src', 'package.json']);

    const subList = await request(app)
      .get(`/api/projects/${project.id}/files?path=src`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(subList.body.map((e: { name: string }) => e.name)).toEqual(['index.js']);

    const read = await request(app)
      .get(`/api/projects/${project.id}/files/content?path=package.json`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(read.status).toBe(200);
    expect(read.body.content).toBe('{"name":"demo"}');

    const write = await request(app)
      .put(`/api/projects/${project.id}/files/content`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ path: 'package.json', content: '{"name":"demo","version":"2.0.0"}' });
    expect(write.status).toBe(204);

    const reread = await request(app)
      .get(`/api/projects/${project.id}/files/content?path=package.json`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(reread.body.content).toContain('2.0.0');

    const del = await request(app)
      .delete(`/api/projects/${project.id}/files?path=src/index.js`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(del.status).toBe(204);
    expect(fs.existsSync(path.join(WORKSPACES_ROOT, 'files-lifecycle', 'src/index.js'))).toBe(false);
  });

  it('rejects a path-traversal attempt via the query string', async () => {
    const project = createProjectWithFiles('traversal-files', { 'a.txt': 'a' });

    const res = await request(app)
      .get(`/api/projects/${project.id}/files/content?path=../../etc/passwd`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(400);
  });

  it('rejects writing a file outside the project root', async () => {
    const project = createProjectWithFiles('traversal-write', { 'a.txt': 'a' });

    const res = await request(app)
      .put(`/api/projects/${project.id}/files/content`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ path: '../escape.txt', content: 'pwned' });
    expect(res.status).toBe(400);
    expect(fs.existsSync(path.join(WORKSPACES_ROOT, 'escape.txt'))).toBe(false);
  });

  it('rejects writing to a path that is an existing directory', async () => {
    const project = createProjectWithFiles('write-onto-dir', { 'src/index.js': 'console.log(1)' });

    const res = await request(app)
      .put(`/api/projects/${project.id}/files/content`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ path: 'src', content: 'oops' });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown project id', async () => {
    const res = await request(app)
      .get('/api/projects/does-not-exist/files')
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/projects/:id writes .env alongside the DB cache', () => {
  it('rewrites the .env file when envVars is part of the patch', async () => {
    const project = createProjectWithFiles('env-sync', { 'package.json': '{}' });

    const res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ envVars: { DATABASE_URL: 'postgres://x', PORT: '3005' } });
    expect(res.status).toBe(200);
    expect(res.body.envVars).toEqual({ DATABASE_URL: 'postgres://x', PORT: '3005' });

    const envContent = fs.readFileSync(path.join(WORKSPACES_ROOT, 'env-sync', '.env'), 'utf8');
    expect(envContent).toBe('DATABASE_URL=postgres://x\nPORT=3005\n');
  });

  it('rejects env var names that are not valid identifiers', async () => {
    const project = createProjectWithFiles('env-invalid', { 'package.json': '{}' });

    const res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ envVars: { 'not-valid-key': 'x' } });
    expect(res.status).toBe(400);
  });

  it('rejects env var values containing newlines', async () => {
    const project = createProjectWithFiles('env-newline', { 'package.json': '{}' });

    const res = await request(app)
      .patch(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ envVars: { FOO: 'line1\nline2' } });
    expect(res.status).toBe(400);
  });
});
