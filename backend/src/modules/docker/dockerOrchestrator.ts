import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import Docker from 'dockerode';
import type { Project } from '../../types/project';

export type LogStream = 'stdout' | 'stderr';
export type OutputFn = (stream: LogStream, data: string) => void;

// dockerode only talks to the Engine API (containers/images/stats/inspect) -
// it has no Compose parser, so Compose lifecycle goes through the `docker
// compose` CLI while stats/inspect go through dockerode for structured JSON.
const docker = new Docker();

const COMPOSE_FILENAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const SYNTHESIZED_COMPOSE_FILENAME = '.panel-compose.generated.yml';

function findComposeFile(projectDir: string): string | null {
  for (const name of COMPOSE_FILENAMES) {
    if (fs.existsSync(path.join(projectDir, name))) return name;
  }
  return null;
}

/**
 * A bare Dockerfile with no compose file still goes through the compose
 * code path via a minimal synthesized single-service file - one execution
 * path instead of a second `docker build && docker run` branch.
 */
export function ensureComposeFile(project: Project, projectDir: string): string {
  const existing = findComposeFile(projectDir);
  if (existing) return existing;

  const port = project.port ?? 3000;
  const yaml = ['services:', '  app:', '    build: .', '    ports:', `      - "${port}:${port}"`, ''].join(
    '\n',
  );
  fs.writeFileSync(path.join(projectDir, SYNTHESIZED_COMPOSE_FILENAME), yaml);
  return SYNTHESIZED_COMPOSE_FILENAME;
}

function runCompose(args: string[], cwd: string, onOutput: OutputFn): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['compose', ...args], { cwd });
    child.stdout.on('data', (chunk: Buffer) => onOutput('stdout', chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => onOutput('stderr', chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`docker compose ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export async function composeUp(
  project: Project,
  projectDir: string,
  onOutput: OutputFn,
): Promise<{ composeProjectName: string }> {
  ensureComposeFile(project, projectDir);
  const composeProjectName = project.slug;
  await runCompose(['-p', composeProjectName, 'up', '-d', '--build'], projectDir, onOutput);
  return { composeProjectName };
}

export async function composeDown(project: Project, projectDir: string): Promise<void> {
  if (!project.composeProjectName) return;
  await runCompose(['-p', project.composeProjectName, 'down'], projectDir, () => {});
}

export async function composeRestart(project: Project, projectDir: string): Promise<void> {
  if (!project.composeProjectName) return;
  await runCompose(['-p', project.composeProjectName, 'restart'], projectDir, () => {});
}

export interface RuntimeStats {
  cpuPercent: number;
  memoryMb: number;
}

function computeContainerStats(stats: Docker.ContainerStats): RuntimeStats {
  const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
  const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
  const onlineCpus = stats.cpu_stats.online_cpus ?? stats.cpu_stats.cpu_usage.percpu_usage?.length ?? 1;
  const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * onlineCpus * 100 : 0;
  const memoryMb = (stats.memory_stats.usage ?? 0) / (1024 * 1024);
  return { cpuPercent: Math.round(cpuPercent * 10) / 10, memoryMb: Math.round(memoryMb) };
}

export async function getComposeStats(composeProjectName: string): Promise<RuntimeStats | null> {
  const containers = await docker.listContainers({
    filters: JSON.stringify({ label: [`com.docker.compose.project=${composeProjectName}`] }),
  });
  if (containers.length === 0) return null;

  const perContainerStats = await Promise.all(
    containers.map((info) => docker.getContainer(info.Id).stats({ stream: false })),
  );

  return perContainerStats.reduce<RuntimeStats>(
    (acc, raw) => {
      const { cpuPercent, memoryMb } = computeContainerStats(raw);
      return { cpuPercent: acc.cpuPercent + cpuPercent, memoryMb: acc.memoryMb + memoryMb };
    },
    { cpuPercent: 0, memoryMb: 0 },
  );
}
