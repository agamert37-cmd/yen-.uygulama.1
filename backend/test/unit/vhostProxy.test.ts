import '../helpers/setPanelDomain';
import { describe, expect, it } from 'vitest';
import { extractSubdomain } from '../../src/modules/proxy/vhostProxy';

describe('extractSubdomain (PANEL_DOMAIN=panel.test.local)', () => {
  it('returns null for the panel\'s own bare domain', () => {
    expect(extractSubdomain('panel.test.local')).toBeNull();
  });

  it('extracts a single-label subdomain', () => {
    expect(extractSubdomain('demo.panel.test.local')).toBe('demo');
  });

  it('is case-insensitive', () => {
    expect(extractSubdomain('DEMO.PANEL.TEST.LOCAL')).toBe('demo');
  });

  it('strips a port suffix before matching', () => {
    expect(extractSubdomain('demo.panel.test.local:4000')).toBe('demo');
  });

  it('rejects multi-level subdomains', () => {
    expect(extractSubdomain('a.b.panel.test.local')).toBeNull();
  });

  it('returns null for a host on a completely different domain', () => {
    expect(extractSubdomain('example.com')).toBeNull();
    expect(extractSubdomain('demo.example.com')).toBeNull();
  });

  it('returns null when the host header is missing', () => {
    expect(extractSubdomain(undefined)).toBeNull();
  });
});
