import type { Project } from '../types/project';

export type LogStream = 'stdout' | 'stderr';
export type OutputFn = (stream: LogStream, data: string) => void;

export interface RuntimeStats {
  cpuPercent: number;
  memoryMb: number;
}

/**
 * Everything the state machine needs from "the outside world" - implemented
 * once for real (Docker Engine API + `docker compose` CLI + PM2) and once
 * as a mock (timers + canned output), selected by PANEL_DRIVER. Lets the
 * whole app - including the frontend's live log/stats UI - be exercised
 * end to end without a real Docker daemon or PM2 process tree.
 */
export interface ProjectDriver {
  installDependencies(project: Project, absPath: string, onOutput: OutputFn): Promise<void>;
  runBuildScript(project: Project, absPath: string, onOutput: OutputFn): Promise<boolean>;
  startNodeProcess(project: Project, absPath: string, onOutput: OutputFn): Promise<{ pm2ProcessName: string }>;
  stopNodeProcess(pm2ProcessName: string): Promise<void>;
  restartNodeProcess(pm2ProcessName: string): Promise<void>;

  composeUp(project: Project, absPath: string, onOutput: OutputFn): Promise<{ composeProjectName: string }>;
  composeDown(project: Project, absPath: string): Promise<void>;
  composeRestart(project: Project, absPath: string): Promise<void>;

  getStats(project: Project): Promise<RuntimeStats | null>;
}
