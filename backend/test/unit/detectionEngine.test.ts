import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectProject } from '../../src/modules/detection/detectionEngine';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'detect-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function touch(relPath: string, content = ''): void {
  const full = path.join(tmpDir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

describe('detectProject', () => {
  it('detects docker mode from docker-compose.yml', () => {
    touch('docker-compose.yml', 'services: {}');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('docker');
    expect(result.hasComposeFile).toBe(true);
  });

  it('detects docker mode from a bare Dockerfile with no compose file', () => {
    touch('Dockerfile', 'FROM node:22');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('docker');
    expect(result.hasComposeFile).toBe(false);
  });

  it('prefers docker mode over node mode when both are present', () => {
    touch('Dockerfile', 'FROM node:22');
    touch('package.json', '{"name":"x"}');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('docker');
  });

  it('detects node mode with pnpm from pnpm-lock.yaml', () => {
    touch('package.json', '{"name":"x"}');
    touch('pnpm-lock.yaml', '');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('node');
    expect(result.packageManager).toBe('pnpm');
  });

  it('detects node mode with yarn from yarn.lock', () => {
    touch('package.json', '{"name":"x"}');
    touch('yarn.lock', '');
    const result = detectProject(tmpDir);
    expect(result.packageManager).toBe('yarn');
  });

  it('defaults node mode to npm when there is a package-lock.json', () => {
    touch('package.json', '{"name":"x"}');
    touch('package-lock.json', '');
    const result = detectProject(tmpDir);
    expect(result.packageManager).toBe('npm');
  });

  it('defaults node mode to npm with no lockfile at all', () => {
    touch('package.json', '{"name":"x"}');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('node');
    expect(result.packageManager).toBe('npm');
  });

  it('detects python mode from requirements.txt', () => {
    touch('requirements.txt', 'flask');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('python');
  });

  it('detects python mode from pyproject.toml', () => {
    touch('pyproject.toml', '[tool.poetry]');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('python');
  });

  it('detects static mode from index.html when there is no package.json', () => {
    touch('index.html', '<html></html>');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('static');
  });

  it('prefers node mode over static mode when both package.json and index.html exist', () => {
    touch('package.json', '{"name":"x"}');
    touch('index.html', '<html></html>');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('node');
  });

  it('falls back to unknown when nothing matches', () => {
    touch('README.md', 'hello');
    const result = detectProject(tmpDir);
    expect(result.projectType).toBe('unknown');
  });
});
