import type { Server as HttpServer } from 'node:http';
import { Server as SocketIOServer } from 'socket.io';
import { z } from 'zod';
import { env } from '../config/env';
import { projectsRepo } from '../db/repositories/projectsRepo';
import { getDriver } from '../drivers';
import { onOutput, onPhaseChange } from '../modules/lifecycle/projectStateMachine';
import { timingSafeEqualString } from '../utils/secureCompare';
import { logger } from '../utils/logger';

const STATS_POLL_INTERVAL_MS = 2000;

function projectRoom(projectId: string): string {
  return `project:${projectId}`;
}

const joinLeaveSchema = z.object({ projectId: z.string().min(1) });

/**
 * Live log/stat streaming over the same auth token as the REST API. Room
 * membership doubles as the trigger for stats polling: it only runs while
 * a project is running AND at least one client is actually watching it, so
 * projects nobody has open don't get polled for nothing.
 */
export function attachSockets(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (typeof token === 'string' && timingSafeEqualString(token, env.PANEL_AUTH_TOKEN)) {
      next();
      return;
    }
    next(new Error('Unauthorized'));
  });

  const statsIntervals = new Map<string, NodeJS.Timeout>();

  function roomSize(projectId: string): number {
    return io.sockets.adapter.rooms.get(projectRoom(projectId))?.size ?? 0;
  }

  function stopStatsPolling(projectId: string): void {
    const handle = statsIntervals.get(projectId);
    if (handle) {
      clearInterval(handle);
      statsIntervals.delete(projectId);
    }
  }

  function startStatsPolling(projectId: string): void {
    if (statsIntervals.has(projectId)) return;
    const handle = setInterval(() => {
      void (async () => {
        if (roomSize(projectId) === 0) {
          stopStatsPolling(projectId);
          return;
        }
        const project = projectsRepo.findById(projectId);
        if (!project || project.status !== 'running') {
          stopStatsPolling(projectId);
          return;
        }
        try {
          const stats = await getDriver().getStats(project);
          io.to(projectRoom(projectId)).emit('stats:update', {
            projectId,
            cpuPercent: stats?.cpuPercent ?? 0,
            memoryMb: stats?.memoryMb ?? 0,
            ts: Date.now(),
          });
        } catch (err) {
          logger.warn({ err, projectId }, 'stats poll failed');
        }
      })();
    }, STATS_POLL_INTERVAL_MS);
    statsIntervals.set(projectId, handle);
  }

  io.on('connection', (socket) => {
    logger.debug({ socketId: socket.id }, 'socket connected');

    socket.on('join:project', (payload: unknown) => {
      const parsed = joinLeaveSchema.safeParse(payload);
      if (!parsed.success) return;
      const { projectId } = parsed.data;
      void socket.join(projectRoom(projectId));

      const project = projectsRepo.findById(projectId);
      if (project?.status === 'running') startStatsPolling(projectId);
    });

    socket.on('leave:project', (payload: unknown) => {
      const parsed = joinLeaveSchema.safeParse(payload);
      if (!parsed.success) return;
      const { projectId } = parsed.data;
      void socket.leave(projectRoom(projectId));
      if (roomSize(projectId) === 0) stopStatsPolling(projectId);
    });

    socket.on('disconnect', () => {
      logger.debug({ socketId: socket.id }, 'socket disconnected');
      for (const projectId of statsIntervals.keys()) {
        if (roomSize(projectId) === 0) stopStatsPolling(projectId);
      }
    });
  });

  onPhaseChange((event) => {
    io.to(projectRoom(event.projectId)).emit('status:change', event);
    if (event.status === 'running' && roomSize(event.projectId) > 0) {
      startStatsPolling(event.projectId);
    } else if (event.status === 'stopped' || event.status === 'error') {
      stopStatsPolling(event.projectId);
    }
  });

  onOutput((event) => {
    io.to(projectRoom(event.projectId)).emit('log:chunk', event);
  });

  return io;
}
