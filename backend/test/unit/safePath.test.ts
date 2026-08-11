import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveWithinRoot } from '../../src/utils/safePath';

describe('resolveWithinRoot', () => {
  const root = '/workspaces/demo';

  it('resolves a plain relative path inside the root', () => {
    expect(resolveWithinRoot(root, 'src/index.js')).toBe(path.join(root, 'src/index.js'));
  });

  it('resolves the root itself', () => {
    expect(resolveWithinRoot(root, '.')).toBe(path.resolve(root));
  });

  it('rejects simple parent traversal', () => {
    expect(() => resolveWithinRoot(root, '../etc/passwd')).toThrow();
  });

  it('rejects nested parent traversal that still escapes', () => {
    expect(() => resolveWithinRoot(root, 'a/../../etc/passwd')).toThrow();
  });

  it('allows nested traversal that stays inside the root', () => {
    expect(resolveWithinRoot(root, 'a/../b')).toBe(path.join(root, 'b'));
  });

  it('rejects absolute paths outside the root', () => {
    expect(() => resolveWithinRoot(root, '/etc/passwd')).toThrow();
  });

  it('rejects null bytes', () => {
    expect(() => resolveWithinRoot(root, 'foo\0bar')).toThrow();
  });
});
