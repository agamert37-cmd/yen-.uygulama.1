import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { env } from '../../src/config/env';
import { WORKSPACES_ROOT } from '../../src/config/paths';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';
import { attachSockets } from '../../src/sockets';
import { startProject } from '../../src/modules/lifecycle/projectStateMachine';

let server: http.Server;
let baseUrl: string;
const openClients: ClientSocket[] = [];

beforeAll(async () => {
  runMigrations();
  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });
  const app = createApp();
  server = http.createServer(app);
  attachSockets(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://localhost:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(WORKSPACES_ROOT, { recursive: true, force: true });
});

beforeEach(() => {
  db.exec('DELETE FROM deploy_events');
  db.exec('DELETE FROM projects');
});

afterEach(() => {
  while (openClients.length > 0) {
    openClients.pop()?.close();
  }
});

function connectClient(token?: string): ClientSocket {
  const client = ioClient(baseUrl, {
    auth: token !== undefined ? { token } : {},
    transports: ['websocket'],
    forceNew: true,
  });
  openClients.push(client);
  return client;
}

function createNodeProjectDir(slug: string, scripts: Record<string, string>): void {
  const absPath = path.join(WORKSPACES_ROOT, slug);
  fs.mkdirSync(absPath, { recursive: true });
  fs.writeFileSync(path.join(absPath, 'package.json'), JSON.stringify({ name: slug, scripts }));
}

describe('socket auth handshake', () => {
  it('rejects a connection with no token', async () => {
    const client = connectClient();
    const err = await new Promise<Error>((resolve) => {
      client.on('connect_error', resolve);
    });
    expect(err.message).toMatch(/unauthorized/i);
  });

  it('rejects a connection with the wrong token', async () => {
    const client = connectClient('wrong-token');
    const err = await new Promise<Error>((resolve) => {
      client.on('connect_error', resolve);
    });
    expect(err.message).toMatch(/unauthorized/i);
  });

  it('accepts a connection with the correct token', async () => {
    const client = connectClient(env.PANEL_AUTH_TOKEN);
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });
    expect(client.connected).toBe(true);
  });
});

describe('project log/stats streaming', () => {
  it(
    'streams log chunks and status changes while a project starts, and periodic stats while running',
    async () => {
      const slug = 'socket-stream-test';
      createNodeProjectDir(slug, { start: 'node index.js' });
      const project = projectsRepo.create({
        name: 'Socket Stream Test',
        slug,
        dirPath: slug,
        sourceType: 'upload',
      });
      projectsRepo.update(project.id, { projectType: 'node', packageManager: 'npm' });

      const client = connectClient(env.PANEL_AUTH_TOKEN);
      await new Promise<void>((resolve, reject) => {
        client.on('connect', () => resolve());
        client.on('connect_error', reject);
      });

      const logChunks: Array<{ projectId: string; stream: string; data: string }> = [];
      const statusChanges: Array<{ projectId: string; status: string }> = [];
      const statsUpdates: Array<{ projectId: string; cpuPercent: number; memoryMb: number }> = [];
      client.on('log:chunk', (event) => logChunks.push(event));
      client.on('status:change', (event) => statusChanges.push(event));
      client.on('stats:update', (event) => statsUpdates.push(event));

      client.emit('join:project', { projectId: project.id });
      await new Promise((resolve) => setTimeout(resolve, 100));

      await startProject(project.id);

      await new Promise<void>((resolve, reject) => {
        const deadline = Date.now() + 5000;
        const check = setInterval(() => {
          if (statusChanges.some((event) => event.status === 'running' || event.status === 'error')) {
            clearInterval(check);
            resolve();
          } else if (Date.now() > deadline) {
            clearInterval(check);
            reject(new Error('timed out waiting for status:change to running/error'));
          }
        }, 25);
      });

      expect(logChunks.length).toBeGreaterThan(0);
      expect(logChunks.every((event) => event.projectId === project.id)).toBe(true);
      expect(statusChanges.map((event) => event.status)).toContain('running');

      // give the stats poller (2s interval) at least one tick
      await new Promise((resolve) => setTimeout(resolve, 2300));
      expect(statsUpdates.length).toBeGreaterThan(0);
      expect(statsUpdates[0]?.projectId).toBe(project.id);
      expect(typeof statsUpdates[0]?.cpuPercent).toBe('number');
    },
    10000,
  );

  it('only delivers events for the joined project, not other projects', async () => {
    const slugA = 'socket-scope-a';
    const slugB = 'socket-scope-b';
    createNodeProjectDir(slugA, { start: 'node index.js' });
    createNodeProjectDir(slugB, { start: 'node index.js' });
    const projectA = projectsRepo.create({ name: 'Scope A', slug: slugA, dirPath: slugA, sourceType: 'upload' });
    const projectB = projectsRepo.create({ name: 'Scope B', slug: slugB, dirPath: slugB, sourceType: 'upload' });
    projectsRepo.update(projectA.id, { projectType: 'node', packageManager: 'npm' });
    projectsRepo.update(projectB.id, { projectType: 'node', packageManager: 'npm' });

    const client = connectClient(env.PANEL_AUTH_TOKEN);
    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });

    const seenProjectIds = new Set<string>();
    client.on('status:change', (event: { projectId: string }) => seenProjectIds.add(event.projectId));

    client.emit('join:project', { projectId: projectA.id });
    await new Promise((resolve) => setTimeout(resolve, 100));

    await startProject(projectA.id);
    await startProject(projectB.id);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(seenProjectIds.has(projectA.id)).toBe(true);
    expect(seenProjectIds.has(projectB.id)).toBe(false);
  });
});
