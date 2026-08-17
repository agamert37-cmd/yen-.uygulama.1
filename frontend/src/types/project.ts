export type SourceType = 'upload' | 'git';

export type ProjectType = 'docker' | 'node' | 'python' | 'static' | 'unknown';

export type PackageManager = 'npm' | 'yarn' | 'pnpm';

export type ProjectStatus =
  | 'idle'
  | 'importing'
  | 'detecting'
  | 'installing'
  | 'building'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'error';

export interface Project {
  id: string;
  name: string;
  slug: string;
  dirPath: string;
  sourceType: SourceType;
  sourceRef: string | null;
  projectType: ProjectType;
  packageManager: PackageManager | null;
  hasComposeFile: boolean;
  port: number | null;
  status: ProjectStatus;
  statusMessage: string | null;
  pm2ProcessName: string | null;
  composeProjectName: string | null;
  envVars: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface DeployEvent {
  id: number;
  phase: string;
  message: string | null;
  createdAt: string;
}

export interface DirEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

export interface RuntimeStats {
  cpuPercent: number;
  memoryMb: number;
}

export interface LogLine {
  stream: 'stdout' | 'stderr';
  data: string;
  ts: number;
}
