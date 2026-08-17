import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../src/db';
import { runMigrations } from '../../src/db/migrate';
import { projectsRepo } from '../../src/db/repositories/projectsRepo';
import { WORKSPACES_ROOT } from '../../src/config/paths';
import {
  onOutput,
  onPhaseChange,
  restartProject,
  startProject,
  stopProject,
} from '../../src/modules/lifecycle/projectStateMachine';
import type { Project, ProjectStatus } from '../../src/types/project';

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

async function waitForStatus(id: string, statuses: ProjectStatus[], timeoutMs = 5000): Promise<Project> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const project = projectsRepo.findById(id);
    if (project && statuses.includes(project.status)) return project;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for one of [${statuses.join(', ')}]`);
}

function createNodeProjectDir(slug: string, scripts: Record<string, string>): string {
  const absPath = path.join(WORKSPACES_ROOT, slug);
  fs.mkdirSync(absPath, { recursive: true });
  fs.writeFileSync(path.join(absPath, 'package.json'), JSON.stringify({ name: slug, scripts }));
  return absPath;
}

describe('startProject (node projects, mock driver)', () => {
  it('runs installing -> building -> starting -> running and records the pm2 process name', async () => {
    const slug = 'node-happy-path';
    createNodeProjectDir(slug, { start: 'node index.js', build: 'echo build' });
    const project = projectsRepo.create({ name: 'Node Happy Path', slug, dirPath: slug, sourceType: 'upload' });
    projectsRepo.update(project.id, { projectType: 'node', packageManager: 'npm' });

    const phases: ProjectStatus[] = [];
    const unsubscribe = onPhaseChange((event) => {
      if (event.projectId === project.id) phases.push(event.status);
    });

    const immediate = await startProject(project.id);
    expect(immediate.status).toBe('installing');

    const finished = await waitForStatus(project.id, ['running', 'error']);
    unsubscribe();

    expect(finished.status).toBe('running');
    expect(finished.pm2ProcessName).toBe(`panel-${slug}`);
    expect(phases).toEqual(['installing', 'building', 'starting', 'running']);
  });

  it('skips the build phase with a message when there is no build script', async () => {
    const slug = 'node-no-build-script';
    createNodeProjectDir(slug, { start: 'node index.js' });
    const project = projectsRepo.create({ name: 'No Build Script', slug, dirPath: slug, sourceType: 'upload' });
    projectsRepo.update(project.id, { projectType: 'node', packageManager: 'npm' });

    const lines: string[] = [];
    const unsubscribe = onOutput((event) => {
      if (event.projectId === project.id) lines.push(event.data);
    });

    await startProject(project.id);
    const finished = await waitForStatus(project.id, ['running', 'error']);
    unsubscribe();

    expect(finished.status).toBe('running');
    expect(lines.some((line) => line.includes('No "build" script'))).toBe(true);
  });

  it('fails into the error status when package.json has no start script', async () => {
    const slug = 'node-no-start-script';
    createNodeProjectDir(slug, { build: 'echo build' });
    const project = projectsRepo.create({ name: 'No Start Script', slug, dirPath: slug, sourceType: 'upload' });
    projectsRepo.update(project.id, { projectType: 'node', packageManager: 'npm' });

    await startProject(project.id);
    const finished = await waitForStatus(project.id, ['running', 'error']);

    expect(finished.status).toBe('error');
    expect(finished.statusMessage).toContain('start');
  });

  it('rejects starting a project whose port is already taken', async () => {
    const net = await import('node:net');
    const server = net.createServer();
    const port = await new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '0.0.0.0', () => {
        const address = server.address();
        if (address === null || typeof address === 'string') {
          reject(new Error('expected AddressInfo'));
          return;
        }
        resolve(address.port);
      });
    });

    const slug = 'node-port-conflict';
    createNodeProjectDir(slug, { start: 'node index.js' });
    const project = projectsRepo.create({ name: 'Port Conflict', slug, dirPath: slug, sourceType: 'upload' });
    projectsRepo.update(project.id, { projectType: 'node', packageManager: 'npm', port });

    await expect(startProject(project.id)).rejects.toThrow(/already in use/);
    expect(projectsRepo.findById(project.id)?.status).toBe('idle');

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects starting a project type that cannot run yet', async () => {
    const project = projectsRepo.create({
      name: 'Python App',
      slug: 'python-app',
      dirPath: 'python-app',
      sourceType: 'upload',
    });
    projectsRepo.update(project.id, { projectType: 'python' });

    await expect(startProject(project.id)).rejects.toThrow(/cannot be started/);
  });

  it('rejects starting a project that is already running', async () => {
    const slug = 'node-already-running';
    createNodeProjectDir(slug, { start: 'node index.js' });
    const project = projectsRepo.create({ name: 'Already Running', slug, dirPath: slug, sourceType: 'upload' });
    projectsRepo.update(project.id, { projectType: 'node', packageManager: 'npm' });

    await startProject(project.id);
    await waitForStatus(project.id, ['running', 'error']);

    await expect(startProject(project.id)).rejects.toThrow(/already/);
  });
});

describe('startProject (docker projects, mock driver)', () => {
  it('runs building -> running and records the compose project name', async () => {
    const project = projectsRepo.create({
      name: 'Docker App',
      slug: 'docker-app',
      dirPath: 'docker-app',
      sourceType: 'upload',
    });
    projectsRepo.update(project.id, { projectType: 'docker', hasComposeFile: true });

    const immediate = await startProject(project.id);
    expect(immediate.status).toBe('building');

    const finished = await waitForStatus(project.id, ['running', 'error']);
    expect(finished.status).toBe('running');
    expect(finished.composeProjectName).toBe('docker-app');
  });
});

describe('stopProject / restartProject', () => {
  async function startAndWaitRunning(slug: string): Promise<Project> {
    createNodeProjectDir(slug, { start: 'node index.js' });
    const project = projectsRepo.create({ name: slug, slug, dirPath: slug, sourceType: 'upload' });
    projectsRepo.update(project.id, { projectType: 'node', packageManager: 'npm' });
    await startProject(project.id);
    return waitForStatus(project.id, ['running', 'error']);
  }

  it('stops a running project', async () => {
    const running = await startAndWaitRunning('node-to-stop');

    const immediate = await stopProject(running.id);
    expect(immediate.status).toBe('stopping');

    const stopped = await waitForStatus(running.id, ['stopped', 'error']);
    expect(stopped.status).toBe('stopped');
  });

  it('refuses to stop a project that is not running', async () => {
    const project = projectsRepo.create({
      name: 'Idle Project',
      slug: 'idle-project',
      dirPath: 'idle-project',
      sourceType: 'upload',
    });
    await expect(stopProject(project.id)).rejects.toThrow(/Cannot stop/);
  });

  it('restarts a running project back to running', async () => {
    const running = await startAndWaitRunning('node-to-restart');

    const immediate = await restartProject(running.id);
    expect(immediate.status).toBe('stopping');

    const finished = await waitForStatus(running.id, ['running', 'error'], 5000);
    expect(finished.status).toBe('running');
  });

  it('refuses to restart a project that is not running', async () => {
    const project = projectsRepo.create({
      name: 'Idle Project 2',
      slug: 'idle-project-2',
      dirPath: 'idle-project-2',
      sourceType: 'upload',
    });
    await expect(restartProject(project.id)).rejects.toThrow(/must be running/);
  });
});
