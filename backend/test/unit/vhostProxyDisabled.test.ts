import { describe, expect, it } from 'vitest';
import { extractSubdomain } from '../../src/modules/proxy/vhostProxy';

// PANEL_DOMAIN is intentionally left unset in this file (setupEnv.ts's
// default) to cover the "publishing disabled" no-op path in isolation.
describe('extractSubdomain (PANEL_DOMAIN unset)', () => {
  it('always returns null, regardless of host', () => {
    expect(extractSubdomain('anything.example.com')).toBeNull();
    expect(extractSubdomain('panel.test.local')).toBeNull();
    expect(extractSubdomain(undefined)).toBeNull();
  });
});
