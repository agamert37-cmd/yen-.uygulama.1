import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureComposeFile } from '../../src/modules/docker/dockerOrchestrator';
import type { Project } from '../../src/types/project';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-synth-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Demo',
    slug: 'demo',
    dirPath: 'demo',
    sourceType: 'upload',
    sourceRef: null,
    projectType: 'docker',
    packageManager: null,
    hasComposeFile: false,
    port: 3000,
    status: 'idle',
    statusMessage: null,
    pm2ProcessName: null,
    composeProjectName: null,
    envVars: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('ensureComposeFile', () => {
  it('returns the existing compose file untouched when one is present', () => {
    fs.writeFileSync(path.join(tmpDir, 'docker-compose.yml'), 'services:\n  app:\n    build: .\n');

    const result = ensureComposeFile(makeProject(), tmpDir);

    expect(result).toBe('docker-compose.yml');
    // must not have synthesized an extra file
    expect(fs.existsSync(path.join(tmpDir, '.panel-compose.generated.yml'))).toBe(false);
  });

  it('recognizes all supported compose filenames', () => {
    fs.writeFileSync(path.join(tmpDir, 'compose.yaml'), 'services: {}\n');
    expect(ensureComposeFile(makeProject(), tmpDir)).toBe('compose.yaml');
  });

  it('synthesizes a minimal single-service compose file for a bare Dockerfile', () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:22\n');

    const result = ensureComposeFile(makeProject({ port: 4321 }), tmpDir);

    expect(result).toBe('.panel-compose.generated.yml');
    const contents = fs.readFileSync(path.join(tmpDir, result), 'utf8');
    expect(contents).toContain('build: .');
    expect(contents).toContain('4321:4321');
  });

  it('falls back to port 3000 when the project has no configured port', () => {
    fs.writeFileSync(path.join(tmpDir, 'Dockerfile'), 'FROM node:22\n');

    const result = ensureComposeFile(makeProject({ port: null }), tmpDir);

    const contents = fs.readFileSync(path.join(tmpDir, result), 'utf8');
    expect(contents).toContain('3000:3000');
  });
});
