import net from 'node:net';

/**
 * Pure-Node bind probe - no dependency on lsof/ss/netstat being present on
 * the host, so it works the same in a minimal container as on a full VM.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '0.0.0.0');
  });
}
