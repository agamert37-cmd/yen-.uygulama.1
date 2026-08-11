import fs from 'node:fs';
import path from 'node:path';
import type { PackageManager, ProjectType } from '../../types/project';

export interface DetectionResult {
  projectType: ProjectType;
  hasComposeFile: boolean;
  packageManager: PackageManager | null;
  message: string;
}

const COMPOSE_FILENAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

function exists(dir: string, filename: string): boolean {
  return fs.existsSync(path.join(dir, filename));
}

function detectPackageManager(dir: string): PackageManager {
  if (exists(dir, 'pnpm-lock.yaml')) return 'pnpm';
  if (exists(dir, 'yarn.lock')) return 'yarn';
  return 'npm'; // covers a package-lock.json, or no lockfile at all
}

/**
 * Precedence matches the spec exactly: Docker > Node > Python > static >
 * unknown, checked at the project root only (no recursive subfolder scan).
 */
export function detectProject(dir: string): DetectionResult {
  const composeFile = COMPOSE_FILENAMES.find((filename) => exists(dir, filename));
  if (composeFile || exists(dir, 'Dockerfile')) {
    return {
      projectType: 'docker',
      hasComposeFile: Boolean(composeFile),
      packageManager: null,
      message: composeFile
        ? `Docker Compose projesi tespit edildi (${composeFile}).`
        : 'Dockerfile tespit edildi (compose dosyası yok, çalıştırırken tek servisli bir compose dosyası otomatik oluşturulacak).',
    };
  }

  if (exists(dir, 'package.json')) {
    const packageManager = detectPackageManager(dir);
    return {
      projectType: 'node',
      hasComposeFile: false,
      packageManager,
      message: `Node.js projesi tespit edildi (paket yöneticisi: ${packageManager}).`,
    };
  }

  if (exists(dir, 'requirements.txt') || exists(dir, 'Pipfile') || exists(dir, 'pyproject.toml')) {
    return {
      projectType: 'python',
      hasComposeFile: false,
      packageManager: null,
      message: 'Python projesi tespit edildi - bu sürümde çalıştırma henüz desteklenmiyor.',
    };
  }

  if (exists(dir, 'index.html')) {
    return {
      projectType: 'static',
      hasComposeFile: false,
      packageManager: null,
      message: 'Statik/Nginx projesi tespit edildi - bu sürümde çalıştırma henüz desteklenmiyor.',
    };
  }

  return {
    projectType: 'unknown',
    hasComposeFile: false,
    packageManager: null,
    message: 'Proje türü tespit edilemedi.',
  };
}
