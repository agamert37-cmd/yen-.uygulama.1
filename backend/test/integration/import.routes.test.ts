import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
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
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
});

afterAll(() => {
  fs.rmSync(WORKSPACES_ROOT, { recursive: true, force: true });
});

function buildZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(content));
  }
  return zip.toBuffer();
}

describe('POST /api/projects/import/upload', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/api/projects/import/upload');
    expect(res.status).toBe(401);
  });

  it('imports a zipped node project and detects it', async () => {
    const zipBuffer = buildZip({
      'package.json': JSON.stringify({ name: 'demo', scripts: { start: 'node index.js' } }),
      'index.js': 'console.log("hi")',
    });

    const res = await request(app)
      .post('/api/projects/import/upload')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('name', 'Zip Import Demo')
      .attach('archive', zipBuffer, 'project.zip');

    expect(res.status).toBe(201);
    expect(res.body.projectType).toBe('node');
    expect(res.body.packageManager).toBe('npm');
    expect(res.body.status).toBe('idle');
    expect(fs.existsSync(path.join(WORKSPACES_ROOT, res.body.slug, 'package.json'))).toBe(true);
  });

  it('rejects a zip-slip archive and leaves no project or file behind', async () => {
    // Built with Python's zipfile (see test/fixtures) - adm-zip's own
    // addFile() sanitizes '../' out of entry names on write, so a fixture
    // built through adm-zip itself can't reproduce a real malicious upload.
    const zipPath = path.join(__dirname, '..', 'fixtures', 'zip-slip.zip');

    const res = await request(app)
      .post('/api/projects/import/upload')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('name', 'Evil Zip')
      .attach('archive', zipPath);

    expect(res.status).toBe(400);

    const list = await request(app).get('/api/projects').set('Authorization', `Bearer ${TOKEN}`);
    expect(list.body).toHaveLength(0);
    expect(fs.existsSync(path.join(WORKSPACES_ROOT, 'evil-zip'))).toBe(false);
  });

  it('rejects a duplicate project name', async () => {
    const zipBuffer = buildZip({ 'index.html': '<html></html>' });
    const first = await request(app)
      .post('/api/projects/import/upload')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('name', 'Dup Name')
      .attach('archive', zipBuffer, 'a.zip');
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/api/projects/import/upload')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('name', 'Dup Name')
      .attach('archive', zipBuffer, 'b.zip');
    expect(second.status).toBe(409);
  });

  it('rejects unsupported archive extensions', async () => {
    const res = await request(app)
      .post('/api/projects/import/upload')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('name', 'Bad Ext')
      .attach('archive', Buffer.from('not an archive'), 'project.exe');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/projects/import/git', () => {
  it('requires auth', async () => {
    const res = await request(app)
      .post('/api/projects/import/git')
      .send({ name: 'x', repoUrl: 'https://example.com/x.git' });
    expect(res.status).toBe(401);
  });

  it('rejects an unsafe git URL before ever shelling out to git, with no project left behind', async () => {
    const res = await request(app)
      .post('/api/projects/import/git')
      .set('Authorization', `Bearer ${TOKEN}`)
      .send({ name: 'Bad Git', repoUrl: 'file:///etc/passwd' });
    expect(res.status).toBe(400);

    const list = await request(app).get('/api/projects').set('Authorization', `Bearer ${TOKEN}`);
    expect(list.body).toHaveLength(0);
  });
});

describe('POST /api/projects/:id/detect', () => {
  it('re-runs detection after files change on disk', async () => {
    const zipBuffer = buildZip({ 'index.html': '<html></html>' });
    const created = await request(app)
      .post('/api/projects/import/upload')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('name', 'Redetect Me')
      .attach('archive', zipBuffer, 'a.zip');
    expect(created.body.projectType).toBe('static');

    fs.writeFileSync(path.join(WORKSPACES_ROOT, created.body.slug, 'package.json'), '{"name":"now-node"}');

    const redetected = await request(app)
      .post(`/api/projects/${created.body.id}/detect`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(redetected.status).toBe(200);
    expect(redetected.body.projectType).toBe('node');
  });

  it('rejects re-detecting a project that is currently running', async () => {
    const zipBuffer = buildZip({ 'index.html': '<html></html>' });
    const created = await request(app)
      .post('/api/projects/import/upload')
      .set('Authorization', `Bearer ${TOKEN}`)
      .field('name', 'Busy Redetect')
      .attach('archive', zipBuffer, 'a.zip');

    projectsRepo.update(created.body.id, { status: 'running' });

    const res = await request(app)
      .post(`/api/projects/${created.body.id}/detect`)
      .set('Authorization', `Bearer ${TOKEN}`);
    expect(res.status).toBe(409);
  });
});
