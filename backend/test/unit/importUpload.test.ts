import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractArchive } from '../../src/modules/workspace/importUpload';

const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

let tmpBase: string;
let destDir: string;

beforeEach(() => {
  tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'import-upload-test-'));
  destDir = path.join(tmpBase, 'dest');
  fs.mkdirSync(destDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpBase, { recursive: true, force: true });
});

describe('extractArchive (zip)', () => {
  it('extracts a well-formed zip into the destination directory', async () => {
    const zip = new AdmZip();
    zip.addFile('package.json', Buffer.from('{"name":"demo"}'));
    zip.addFile('src/index.js', Buffer.from('console.log(1)'));
    const zipPath = path.join(tmpBase, 'good.zip');
    zip.writeZip(zipPath);

    await extractArchive(zipPath, 'good.zip', destDir);

    expect(fs.readFileSync(path.join(destDir, 'package.json'), 'utf8')).toContain('demo');
    expect(fs.existsSync(path.join(destDir, 'src/index.js'))).toBe(true);
  });

  it('rejects a zip-slip entry (built with Python zipfile, bypassing adm-zip write-side sanitization) and writes nothing outside the destination', async () => {
    const zipPath = path.join(FIXTURES_DIR, 'zip-slip.zip');

    await expect(extractArchive(zipPath, 'zip-slip.zip', destDir)).rejects.toThrow();
    expect(fs.existsSync(path.join(tmpBase, 'evil.txt'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(tmpBase), 'evil.txt'))).toBe(false);
    // the safe sibling entry must not have been written either - validation
    // happens for every entry before anything is written to disk
    expect(fs.existsSync(path.join(destDir, 'normal.txt'))).toBe(false);
  });

  it('rejects unsupported archive extensions', async () => {
    const filePath = path.join(tmpBase, 'not-an-archive.exe');
    fs.writeFileSync(filePath, 'x');
    await expect(extractArchive(filePath, 'not-an-archive.exe', destDir)).rejects.toThrow();
  });
});

describe('extractArchive (tar.gz)', () => {
  it('extracts a well-formed tar.gz into the destination directory', async () => {
    const tarPath = path.join(FIXTURES_DIR, 'good.tar.gz');

    await extractArchive(tarPath, 'good.tar.gz', destDir);

    expect(fs.readFileSync(path.join(destDir, 'package.json'), 'utf8')).toContain('demo');
    expect(fs.existsSync(path.join(destDir, 'src/index.js'))).toBe(true);
  });

  it('rejects a tar-slip entry (built with Python tarfile) and writes nothing outside the destination', async () => {
    const tarPath = path.join(FIXTURES_DIR, 'tar-slip.tar.gz');

    await expect(extractArchive(tarPath, 'tar-slip.tar.gz', destDir)).rejects.toThrow();
    expect(fs.existsSync(path.join(tmpBase, 'evil.txt'))).toBe(false);
    expect(fs.existsSync(path.join(path.dirname(tmpBase), 'evil.txt'))).toBe(false);
  });

  it('rejects a symlink entry pointing outside the destination', async () => {
    const tarPath = path.join(FIXTURES_DIR, 'tar-symlink.tar.gz');

    await expect(extractArchive(tarPath, 'tar-symlink.tar.gz', destDir)).rejects.toThrow();
    expect(fs.existsSync(path.join(destDir, 'evil-link'))).toBe(false);
  });
});
