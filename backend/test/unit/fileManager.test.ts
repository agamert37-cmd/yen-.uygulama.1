import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  deletePath,
  listDirectory,
  readFileContent,
  writeEnvFile,
  writeFileContent,
} from '../../src/modules/files/fileManager';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'file-manager-test-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('listDirectory', () => {
  it('lists directories before files, both alphabetically', () => {
    fs.writeFileSync(path.join(root, 'b.txt'), 'b');
    fs.writeFileSync(path.join(root, 'a.txt'), 'a');
    fs.mkdirSync(path.join(root, 'zdir'));
    fs.mkdirSync(path.join(root, 'adir'));

    const entries = listDirectory(root, '.');

    expect(entries.map((e) => e.name)).toEqual(['adir', 'zdir', 'a.txt', 'b.txt']);
    expect(entries[0]?.type).toBe('directory');
    expect(entries[2]?.type).toBe('file');
  });

  it('lists a nested subdirectory', () => {
    fs.mkdirSync(path.join(root, 'sub'));
    fs.writeFileSync(path.join(root, 'sub', 'inner.txt'), 'x');

    const entries = listDirectory(root, 'sub');
    expect(entries).toHaveLength(1);
    expect(entries[0]?.name).toBe('inner.txt');
  });

  it('404s for a missing path', () => {
    expect(() => listDirectory(root, 'does-not-exist')).toThrow();
  });

  it('400s when the path is a file, not a directory', () => {
    fs.writeFileSync(path.join(root, 'file.txt'), 'x');
    expect(() => listDirectory(root, 'file.txt')).toThrow();
  });

  it('rejects a traversal attempt', () => {
    expect(() => listDirectory(root, '../')).toThrow();
  });
});

describe('readFileContent', () => {
  it('reads a small text file', () => {
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"demo"}');
    expect(readFileContent(root, 'package.json')).toBe('{"name":"demo"}');
  });

  it('404s for a missing file', () => {
    expect(() => readFileContent(root, 'nope.txt')).toThrow();
  });

  it('400s when the path is a directory', () => {
    fs.mkdirSync(path.join(root, 'sub'));
    expect(() => readFileContent(root, 'sub')).toThrow();
  });

  it('400s for an oversized file', () => {
    fs.writeFileSync(path.join(root, 'big.txt'), Buffer.alloc(2 * 1024 * 1024 + 1, 'a'));
    expect(() => readFileContent(root, 'big.txt')).toThrow(/too large/);
  });

  it('400s for a binary extension', () => {
    fs.writeFileSync(path.join(root, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(() => readFileContent(root, 'image.png')).toThrow(/Binary/);
  });
});

describe('writeFileContent', () => {
  it('creates a new file, including intermediate directories', () => {
    writeFileContent(root, 'a/b/c.txt', 'hello');
    expect(fs.readFileSync(path.join(root, 'a/b/c.txt'), 'utf8')).toBe('hello');
  });

  it('overwrites an existing file', () => {
    fs.writeFileSync(path.join(root, 'x.txt'), 'old');
    writeFileContent(root, 'x.txt', 'new');
    expect(fs.readFileSync(path.join(root, 'x.txt'), 'utf8')).toBe('new');
  });

  it('rejects oversized content', () => {
    const huge = 'a'.repeat(2 * 1024 * 1024 + 1);
    expect(() => writeFileContent(root, 'x.txt', huge)).toThrow(/too large/);
  });

  it('rejects a traversal attempt', () => {
    expect(() => writeFileContent(root, '../escape.txt', 'x')).toThrow();
  });
});

describe('deletePath', () => {
  it('deletes a file', () => {
    fs.writeFileSync(path.join(root, 'x.txt'), 'x');
    deletePath(root, 'x.txt');
    expect(fs.existsSync(path.join(root, 'x.txt'))).toBe(false);
  });

  it('deletes a directory recursively', () => {
    fs.mkdirSync(path.join(root, 'sub/inner'), { recursive: true });
    fs.writeFileSync(path.join(root, 'sub/inner/x.txt'), 'x');
    deletePath(root, 'sub');
    expect(fs.existsSync(path.join(root, 'sub'))).toBe(false);
  });

  it('refuses to delete the project root itself', () => {
    expect(() => deletePath(root, '.')).toThrow(/root/);
    expect(fs.existsSync(root)).toBe(true);
  });

  it('404s for a missing path', () => {
    expect(() => deletePath(root, 'nope.txt')).toThrow();
  });
});

describe('writeEnvFile', () => {
  it('writes KEY=VALUE lines and overwrites any existing .env', () => {
    fs.writeFileSync(path.join(root, '.env'), 'STALE=1\n');
    writeEnvFile(root, { DATABASE_URL: 'postgres://x', PORT: '3005' });

    const written = fs.readFileSync(path.join(root, '.env'), 'utf8');
    expect(written).toBe('DATABASE_URL=postgres://x\nPORT=3005\n');
  });

  it('writes an empty file for an empty env var map', () => {
    writeEnvFile(root, {});
    expect(fs.readFileSync(path.join(root, '.env'), 'utf8')).toBe('\n');
  });
});
