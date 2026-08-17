import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import type { NextFunction, Request, Response } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { env } from '../../config/env';
import { projectsRepo } from '../../db/repositories/projectsRepo';
import type { Project } from '../../types/project';
import { logger } from '../../utils/logger';

/**
 * The single-label subdomain a Host header addresses, or null if the
 * request is for the panel's own bare domain, or PANEL_DOMAIN isn't
 * configured (local/dev - vhost routing is then a total no-op). Multi-level
 * subdomains are rejected - published projects get exactly one label.
 */
export function extractSubdomain(hostHeader: string | undefined): string | null {
  if (!env.PANEL_DOMAIN || !hostHeader) return null;
  const hostname = hostHeader.split(':')[0]!.toLowerCase();
  const base = env.PANEL_DOMAIN;
  if (hostname === base) return null;
  if (!hostname.endsWith(`.${base}`)) return null;
  const sub = hostname.slice(0, hostname.length - base.length - 1);
  if (sub.length === 0 || sub.includes('.')) return null;
  return sub;
}

function resolvePublishedProject(subdomain: string): Project | undefined {
  const project = projectsRepo.findBySubdomain(subdomain);
  if (!project || project.status !== 'running' || !project.port) return undefined;
  return project;
}

const proxy = createProxyMiddleware({
  target: 'http://127.0.0.1:1', // placeholder - router() below always supplies the real target
  changeOrigin: true,
  ws: true,
  router: (req) => {
    const subdomain = extractSubdomain(req.headers.host);
    const project = subdomain ? resolvePublishedProject(subdomain) : undefined;
    return project ? `http://127.0.0.1:${project.port}` : undefined;
  },
  on: {
    error: (err, req, res) => {
      logger.warn({ err, host: req.headers.host }, 'vhost proxy error');
      if ('writeHead' in res) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'BadGateway', message: 'Upstream project did not respond' }));
      }
    },
  },
});

/**
 * Mounted as the VERY FIRST middleware in app.ts - published-project
 * traffic must bypass the panel's own helmet/cors/json-parsing/authGuard
 * entirely, and the raw request body must reach http-proxy-middleware
 * unconsumed (express.json() would otherwise drain the stream for POSTs).
 */
export function vhostGate(req: Request, res: Response, next: NextFunction): void {
  const subdomain = extractSubdomain(req.headers.host);
  if (subdomain === null) {
    next();
    return;
  }
  const project = resolvePublishedProject(subdomain);
  if (!project) {
    res.status(404).json({
      error: 'NotFound',
      message: `No published, running project for host "${req.headers.host}"`,
    });
    return;
  }
  proxy(req, res, next);
}

/**
 * Wires WS upgrade requests for subdomain hosts. Socket.io registers its own
 * 'upgrade' listener on the same httpServer (attachSockets, called before
 * this) and only reacts to its own path - this handler must return
 * immediately (not destroy the socket) for every non-subdomain host so it
 * never interferes with the panel's own /socket.io upgrades.
 *
 * Known limitation: if a published project's own app also happens to serve
 * a WebSocket endpoint at the exact path "/socket.io/", the panel's own
 * socket.io listener (registered first, and path-based rather than
 * Host-based) may intercept that upgrade before it reaches this handler.
 * Documented in the README rather than solved here - narrow edge case,
 * out of scope for this milestone.
 */
export function attachVhostUpgrade(server: HttpServer): void {
  server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const subdomain = extractSubdomain(req.headers.host);
    if (subdomain === null) return;
    const project = resolvePublishedProject(subdomain);
    if (!project) {
      socket.destroy();
      return;
    }
    proxy.upgrade(req, socket, head);
  });
}
