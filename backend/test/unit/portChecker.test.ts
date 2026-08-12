import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { isPortFree } from '../../src/modules/portcheck/portChecker';

function listenOnEphemeralPort(server: net.Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('expected an AddressInfo from an ephemeral port bind'));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: net.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe('isPortFree', () => {
  it('reports a released port as free', async () => {
    const server = net.createServer();
    const port = await listenOnEphemeralPort(server);
    await closeServer(server);

    expect(await isPortFree(port)).toBe(true);
  });

  it('reports a port as busy while bound, then free again right after release', async () => {
    const server = net.createServer();
    const port = await listenOnEphemeralPort(server);

    expect(await isPortFree(port)).toBe(false);

    await closeServer(server);
    expect(await isPortFree(port)).toBe(true);
  });
});
