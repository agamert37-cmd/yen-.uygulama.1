import { hasScript } from '../modules/process/packageJson';
import { pm2ProcessNameFor } from '../modules/process/pm2Orchestrator';
import type { OutputFn, ProjectDriver } from './types';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function simulate(lines: string[], onOutput: OutputFn, msPerLine = 150): Promise<void> {
  for (const line of lines) {
    await delay(msPerLine);
    onOutput('stdout', `${line}\n`);
  }
}

/**
 * Simulates Docker/PM2 execution with timers and canned output, while still
 * reading the real project directory for things like package.json scripts -
 * only the actual process/container spawning is faked, so error paths
 * (missing start script, etc) behave the same as the real driver.
 */
export const mockDriver: ProjectDriver = {
  async installDependencies(project, _absPath, onOutput) {
    await simulate(
      [`[mock] ${project.packageManager ?? 'npm'} install`, 'added 42 packages in 1.2s'],
      onOutput,
    );
  },

  async runBuildScript(project, absPath, onOutput) {
    if (!hasScript(absPath, 'build')) {
      onOutput('stdout', 'No "build" script in package.json - skipping build step.\n');
      return false;
    }
    await simulate([`[mock] ${project.packageManager ?? 'npm'} run build`, 'Build complete.'], onOutput);
    return true;
  },

  async startNodeProcess(project, absPath, onOutput) {
    if (!hasScript(absPath, 'start')) {
      throw new Error('package.json has no "start" script - add one (e.g. "start": "node index.js").');
    }
    const pm2ProcessName = pm2ProcessNameFor(project.slug);
    await simulate([`[mock] pm2 start -> ${pm2ProcessName}`], onOutput);
    return { pm2ProcessName };
  },

  async stopNodeProcess() {
    await delay(150);
  },

  async restartNodeProcess() {
    await delay(150);
  },

  async composeUp(project, _absPath, onOutput) {
    await simulate(
      [
        '[mock] docker compose up -d --build',
        ' => [app] Building 2.1s',
        ' => [app] Built',
        `Container ${project.slug}-app-1  Started`,
      ],
      onOutput,
    );
    return { composeProjectName: project.slug };
  },

  async composeDown() {
    await delay(150);
  },

  async composeRestart() {
    await delay(150);
  },

  async getStats(project) {
    if (project.status !== 'running') return null;
    // Just enough variation to make the live stats UI feel alive without a
    // real Docker/PM2 daemon behind it.
    const base = project.projectType === 'docker' ? 8 : 3;
    return {
      cpuPercent: Math.round((base + Math.random() * 4) * 10) / 10,
      memoryMb: Math.round(80 + Math.random() * 60),
    };
  },
};
