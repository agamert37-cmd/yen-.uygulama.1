import fs from 'node:fs';
import path from 'node:path';

interface PackageJsonShape {
  scripts?: Record<string, string>;
}

function readPackageJson(projectDir: string): PackageJsonShape | null {
  try {
    const raw = fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8');
    return JSON.parse(raw) as PackageJsonShape;
  } catch {
    return null;
  }
}

export function hasScript(projectDir: string, scriptName: string): boolean {
  const pkg = readPackageJson(projectDir);
  return Boolean(pkg?.scripts?.[scriptName]);
}
