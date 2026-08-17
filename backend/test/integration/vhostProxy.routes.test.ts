import '../helpers/setPanelDomain';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';

const app = createApp();

let target: http.Server;
let targetPort: number;

beforeAll(async () => {
  runMigrations();
  target = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('hello from target');
  });
  await new Promise<void>((resolve) => target.listen(0, '127.0.0.1', resolve));
  targetPort = (target.address() as AddressInfo).port;
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
});

afterAll(async () => {
  await new Promise<void>((resolve) => target.close(() => resolve()));
});

describe('vhost reverse proxy (PANEL_DOMAIN=panel.test.local)', () => {
  it('proxies a request for a published, running project subdomain to its port', async () => {
    const project = projectsRepo.create({ name: 'Demo', slug: 'demo', dirPath: 'demo', sourceType: 'upload' });
    projectsRepo.update(project.id, { status: 'running', port: targetPort, subdomain: 'demo' });

    const res = await request(app).get('/').set('Host', 'demo.panel.test.local');
    expect(res.status).toBe(200);
    expect(res.text).toBe('hello from target');
  });

  it('404s with a clear JSON body for an unpublished/unknown subdomain', async () => {
    const res = await request(app).get('/').set('Host', 'unknown-sub.panel.test.local');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NotFound');
  });

  it("leaves the panel's own bare domain completely unaffected", async () => {
    const res = await request(app).get('/api/health').set('Host', 'panel.test.local');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('re-checks live status on every request rather than a publish-time snapshot', async () => {
    const project = projectsRepo.create({ name: 'Demo', slug: 'demo', dirPath: 'demo', sourceType: 'upload' });
    projectsRepo.update(project.id, { status: 'running', port: targetPort, subdomain: 'demo' });

    const whileRunning = await request(app).get('/').set('Host', 'demo.panel.test.local');
    expect(whileRunning.status).toBe(200);

    projectsRepo.update(project.id, { status: 'stopped' });

    const afterStop = await request(app).get('/').set('Host', 'demo.panel.test.local');
    expect(afterStop.status).toBe(404);
  });
});
