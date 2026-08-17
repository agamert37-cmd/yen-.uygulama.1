import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import * as tar from 'tar';
import { HttpError } from '../../middleware/errorHandler';
import { resolveWithinRoot } from '../../utils/safePath';

const MAX_ENTRIES = 20_000;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 500 * 1024 * 1024; // 500MB, basic zip/tar-bomb guard

function extractZip(archivePath: string, destDir: string): void {
  const zip = new AdmZip(archivePath);
  const entries = zip.getEntries();

  if (entries.length > MAX_ENTRIES) {
    throw new HttpError(400, 'Archive has too many entries');
  }

  let totalSize = 0;
  for (const entry of entries) {
    totalSize += entry.header.size;
  }
  if (totalSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new HttpError(400, 'Archive is too large once extracted');
  }

  // Validate every entry path before writing anything, so a malicious entry
  // late in the archive can't cause a partial, already-escaped extraction.
  // adm-zip only sanitizes names on its own write path (addFile), not when
  // parsing an externally supplied archive, so this check is load-bearing.
  const targets = entries.map((entry) => ({
    entry,
    targetPath: resolveWithinRoot(destDir, entry.entryName),
  }));

  for (const { entry, targetPath } of targets) {
    if (entry.isDirectory) {
      fs.mkdirSync(targetPath, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    // getData() reads the entry's bytes; we write them ourselves rather than
    // using AdmZip's own extract-to-disk helpers, so no entry can ever
    // trigger symlink creation - only ever plain files/directories.
    fs.writeFileSync(targetPath, entry.getData());
  }
}

interface TarListEntry {
  path: string;
  size: number;
  type: string;
}

async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  const entries: TarListEntry[] = [];
  await tar.t({
    file: archivePath,
    onentry: (entry) => {
      entries.push({ path: entry.path, size: entry.size ?? 0, type: entry.type ?? 'File' });
    },
  });

  if (entries.length > MAX_ENTRIES) {
    throw new HttpError(400, 'Archive has too many entries');
  }

  const totalSize = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (totalSize > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    throw new HttpError(400, 'Archive is too large once extracted');
  }

  for (const entry of entries) {
    if (entry.type !== 'File' && entry.type !== 'Directory') {
      // Blocks symlinks/hardlinks outright - tar (unlike our manual zip
      // writer) will happily create real symlinks on extract, which is a
      // realistic escape vector a plain path check on `entry.path` wouldn't
      // catch on its own.
      throw new HttpError(400, `Unsupported archive entry type: ${entry.type} (${entry.path})`);
    }
    resolveWithinRoot(destDir, entry.path);
  }

  await tar.x({
    file: archivePath,
    cwd: destDir,
    strict: true,
  });
}

export async function extractArchive(
  archivePath: string,
  originalFilename: string,
  destDir: string,
): Promise<void> {
  const lower = originalFilename.toLowerCase();
  if (lower.endsWith('.zip')) {
    extractZip(archivePath, destDir);
    return;
  }
  if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) {
    await extractTarGz(archivePath, destDir);
    return;
  }
  throw new HttpError(400, 'Unsupported archive type - expected .zip, .tar.gz, or .tgz');
}
