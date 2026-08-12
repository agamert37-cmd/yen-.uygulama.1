import { getDriver } from '../../drivers';
import type { LogStream } from '../../drivers/types';
import { projectsRepo } from '../../db/repositories/projectsRepo';
import { HttpError } from '../../middleware/errorHandler';
import type { Project, ProjectStatus } from '../../types/project';
import { projectAbsPath } from '../workspace/workspaceManager';
import { isPortFree } from '../portcheck/portChecker';
import { appendLog } from './logBuffer';

export interface PhaseChangeEvent {
  projectId: string;
  status: ProjectStatus;
  message: string | null;
}

export interface OutputEvent {
  projectId: string;
  stream: LogStream;
  data: string;
}

// Simple in-process pub/sub - the Socket.io layer (a separate concern)
// subscribes here instead of the state machine knowing anything about
// sockets. Multiple listeners are supported since both log streaming and
// stats streaming may want to observe status changes independently.
const phaseListeners = new Set<(event: PhaseChangeEvent) => void>();
const outputListeners = new Set<(event: OutputEvent) => void>();

export function onPhaseChange(listener: (event: PhaseChangeEvent) => void): () => void {
  phaseListeners.add(listener);
  return () => phaseListeners.delete(listener);
}

export function onOutput(listener: (event: OutputEvent) => void): () => void {
  outputListeners.add(listener);
  return () => outputListeners.delete(listener);
}

function setStatus(projectId: string, status: ProjectStatus, message?: string | null): Project {
  const updated = projectsRepo.update(projectId, { status, statusMessage: message ?? null });
  if (!updated) throw new HttpError(404, 'Project not found');
  projectsRepo.addDeployEvent(projectId, status, message ?? undefined);
  const event: PhaseChangeEvent = { projectId, status, message: message ?? null };
  for (const listener of phaseListeners) listener(event);
  return updated;
}

function makeOutputSink(projectId: string): (stream: LogStream, data: string) => void {
  return (stream, data) => {
    appendLog(projectId, stream, data);
    const event: OutputEvent = { projectId, stream, data };
    for (const listener of outputListeners) listener(event);
  };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const RUNNABLE_TYPES = new Set(['docker', 'node']);
const BUSY_STATUSES = new Set<ProjectStatus>(['importing', 'detecting', 'installing', 'building', 'starting', 'running', 'stopping']);

/**
 * Validates preconditions and performs the first status transition
 * synchronously (fast feedback on the HTTP response), then runs the actual
 * install/build/start sequence in the background - a real `npm install` or
 * `docker compose up --build` can take anywhere from seconds to minutes, so
 * the HTTP request must not block on it. Progress is observable via the
 * deploy-event trail, the log buffer/socket stream, and polling GET
 * /projects/:id.
 */
export async function startProject(projectId: string): Promise<Project> {
  const project = projectsRepo.findById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (BUSY_STATUSES.has(project.status)) {
    throw new HttpError(409, `Project is already ${project.status}`);
  }
  if (!RUNNABLE_TYPES.has(project.projectType)) {
    throw new HttpError(400, `Project type "${project.projectType}" cannot be started in this version`);
  }
  if (project.port) {
    const free = await isPortFree(project.port);
    if (!free) throw new HttpError(409, `Port ${project.port} is already in use`);
  }

  const initialStatus: ProjectStatus = project.projectType === 'docker' ? 'building' : 'installing';
  const updated = setStatus(projectId, initialStatus);

  void runStartSequence(projectId, project).catch(() => {
    // runStartSequence already records failures via setStatus/deploy_events;
    // this exists only so a rejection never becomes an unhandled rejection.
  });

  return updated;
}

async function runStartSequence(projectId: string, project: Project): Promise<void> {
  const absPath = projectAbsPath(project.dirPath);
  const driver = getDriver();
  const output = makeOutputSink(projectId);

  try {
    if (project.projectType === 'docker') {
      const { composeProjectName } = await driver.composeUp(project, absPath, output);
      projectsRepo.update(projectId, { composeProjectName });
    } else {
      await driver.installDependencies(project, absPath, output);
      setStatus(projectId, 'building');
      await driver.runBuildScript(project, absPath, output);
      setStatus(projectId, 'starting');
      const { pm2ProcessName } = await driver.startNodeProcess(project, absPath, output);
      projectsRepo.update(projectId, { pm2ProcessName });
    }
    setStatus(projectId, 'running');
  } catch (err) {
    setStatus(projectId, 'error', errorMessage(err));
  }
}

export async function stopProject(projectId: string): Promise<Project> {
  const project = projectsRepo.findById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (project.status !== 'running' && project.status !== 'error') {
    throw new HttpError(409, `Cannot stop a project in status "${project.status}"`);
  }

  const updated = setStatus(projectId, 'stopping');
  void runStopSequence(projectId, project).catch(() => {});
  return updated;
}

async function runStopSequence(projectId: string, project: Project): Promise<void> {
  const driver = getDriver();
  const absPath = projectAbsPath(project.dirPath);

  try {
    if (project.projectType === 'docker') {
      await driver.composeDown(project, absPath);
    } else if (project.pm2ProcessName) {
      await driver.stopNodeProcess(project.pm2ProcessName);
    }
    setStatus(projectId, 'stopped');
  } catch (err) {
    setStatus(projectId, 'error', errorMessage(err));
  }
}

export async function restartProject(projectId: string): Promise<Project> {
  const project = projectsRepo.findById(projectId);
  if (!project) throw new HttpError(404, 'Project not found');
  if (project.status !== 'running') {
    throw new HttpError(409, 'Project must be running to restart');
  }

  const updated = setStatus(projectId, 'stopping');
  void runRestartSequence(projectId, project).catch(() => {});
  return updated;
}

async function runRestartSequence(projectId: string, project: Project): Promise<void> {
  const driver = getDriver();
  const absPath = projectAbsPath(project.dirPath);

  try {
    setStatus(projectId, 'starting');
    if (project.projectType === 'docker') {
      await driver.composeRestart(project, absPath);
    } else if (project.pm2ProcessName) {
      await driver.restartNodeProcess(project.pm2ProcessName);
    }
    setStatus(projectId, 'running');
  } catch (err) {
    setStatus(projectId, 'error', errorMessage(err));
  }
}
