import * as dockerOrchestrator from '../modules/docker/dockerOrchestrator';
import * as pm2Orchestrator from '../modules/process/pm2Orchestrator';
import type { ProjectDriver } from './types';

export const realDriver: ProjectDriver = {
  installDependencies: (project, absPath, onOutput) =>
    pm2Orchestrator.installDependencies(project.packageManager ?? 'npm', absPath, onOutput),

  runBuildScript: (project, absPath, onOutput) =>
    pm2Orchestrator.runBuildScript(project.packageManager ?? 'npm', absPath, onOutput),

  startNodeProcess: async (project, absPath) => {
    const pm2ProcessName = await pm2Orchestrator.startNodeProcess(project, absPath);
    return { pm2ProcessName };
  },

  stopNodeProcess: (pm2ProcessName) => pm2Orchestrator.stopNodeProcess(pm2ProcessName),
  restartNodeProcess: (pm2ProcessName) => pm2Orchestrator.restartNodeProcess(pm2ProcessName),

  composeUp: (project, absPath, onOutput) => dockerOrchestrator.composeUp(project, absPath, onOutput),
  composeDown: (project, absPath) => dockerOrchestrator.composeDown(project, absPath),
  composeRestart: (project, absPath) => dockerOrchestrator.composeRestart(project, absPath),

  getStats: async (project) => {
    if (project.projectType === 'docker' && project.composeProjectName) {
      return dockerOrchestrator.getComposeStats(project.composeProjectName);
    }
    if (project.projectType === 'node' && project.pm2ProcessName) {
      return pm2Orchestrator.getPm2Stats(project.pm2ProcessName);
    }
    return null;
  },
};
