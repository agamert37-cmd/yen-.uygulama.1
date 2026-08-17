import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { ensureDirectories } from './config/paths';
import { runMigrations } from './db/migrate';
import { attachVhostUpgrade } from './modules/proxy/vhostProxy';
import { attachSockets } from './sockets';
import { logger } from './utils/logger';

ensureDirectories();
runMigrations();

const app = createApp();
const server = http.createServer(app);
attachSockets(server);
attachVhostUpgrade(server);

server.listen(env.PORT, () => {
  logger.info(`Panel listening on port ${env.PORT} (driver=${env.PANEL_DRIVER})`);
});
