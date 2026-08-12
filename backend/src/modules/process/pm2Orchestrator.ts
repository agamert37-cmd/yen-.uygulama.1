import { spawn } from 'node:child_process';
import pm2 from 'pm2';
import type { PackageManager, Project } from '../../types/project';
import { hasScript } from './packageJson';

export type LogStream = 'stdout' | 'stderr';
export type OutputFn = (stream: LogStream, data: string) => void;

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  onOutput: OutputFn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env });
    child.stdout.on('data', (chunk: Buffer) => onOutput('stdout', chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => onOutput('stderr', chunk.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export async function installDependencies(
  packageManager: PackageManager,
  projectDir: string,
  onOutput: OutputFn,
): Promise<void> {
  await runCommand(packageManager, ['install'], projectDir, process.env, onOutput);
}

export async function runBuildScript(
  packageManager: PackageManager,
  projectDir: string,
  onOutput: OutputFn,
): Promise<boolean> {
  if (!hasScript(projectDir, 'build')) {
    onOutput('stdout', 'No "build" script in package.json - skipping build step.\n');
    return false;
  }
  await runCommand(packageManager, ['run', 'build'], projectDir, process.env, onOutput);
  return true;
}

// A single shared, long-lived connection to the pm2 daemon (it launches one
// if none is running). Reconnecting per-call would be wasteful for stats
// polling, which happens every few seconds while a project is running.
let connectPromise: Promise<void> | null = null;

function ensureConnected(): Promise<void> {
  if (!connectPromise) {
    connectPromise = new Promise((resolve, reject) => {
      pm2.connect((err) => {
        if (err) {
          connectPromise = null;
          reject(err instanceof Error ? err : new Error(String(err)));
          return;
        }
        resolve();
      });
    });
  }
  return connectPromise;
}

export function pm2ProcessNameFor(slug: string): string {
  return `panel-${slug}`;
}

export async function startNodeProcess(project: Project, projectDir: string): Promise<string> {
  if (!hasScript(projectDir, 'start')) {
    throw new Error('package.json has no "start" script - add one (e.g. "start": "node index.js").');
  }

  const pm2Name = pm2ProcessNameFor(project.slug);
  const env: Record<string, string> = { ...(process.env as Record<string, string>), ...project.envVars };
  if (project.port) env.PORT = String(project.port);

  await ensureConnected();
  await new Promise<void>((resolve, reject) => {
    pm2.start(
      {
        name: pm2Name,
        script: project.packageManager ?? 'npm',
        args: ['run', 'start'],
        cwd: projectDir,
        env,
        interpreter: 'none',
        autorestart: true,
        max_restarts: 10,
      },
      (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()),
    );
  });

  return pm2Name;
}

export async function stopNodeProcess(pm2ProcessName: string): Promise<void> {
  await ensureConnected();
  await new Promise<void>((resolve, reject) => {
    pm2.delete(pm2ProcessName, (err) => (err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve()));
  });
}

export async function restartNodeProcess(pm2ProcessName: string): Promise<void> {
  await ensureConnected();
  await new Promise<void>((resolve, reject) => {
    pm2.restart(pm2ProcessName, (err) =>
      err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve(),
    );
  });
}

export interface RuntimeStats {
  cpuPercent: number;
  memoryMb: number;
}

export async function getPm2Stats(pm2ProcessName: string): Promise<RuntimeStats | null> {
  await ensureConnected();
  const list = await new Promise<pm2.ProcessDescription[]>((resolve, reject) => {
    pm2.describe(pm2ProcessName, (err, processDescriptionList) =>
      err ? reject(err instanceof Error ? err : new Error(String(err))) : resolve(processDescriptionList),
    );
  });
  const proc = list[0];
  if (!proc?.monit) return null;
  return {
    cpuPercent: proc.monit.cpu ?? 0,
    memoryMb: Math.round((proc.monit.memory ?? 0) / (1024 * 1024)),
  };
}
