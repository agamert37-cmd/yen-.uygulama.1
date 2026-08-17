import { describe, expect, it } from 'vitest';
import { assertValidGitUrl } from '../../src/modules/workspace/importGit';

describe('assertValidGitUrl', () => {
  it.each([
    'https://github.com/user/repo.git',
    'http://example.com/repo.git',
    'git@github.com:user/repo.git',
  ])('accepts %s', (url) => {
    expect(() => assertValidGitUrl(url)).not.toThrow();
  });

  it.each([
    'file:///etc/passwd',
    '-upload-pack=/bin/sh',
    'ftp://example.com/repo.git',
    '',
    'just some text',
    'https://example.com/has a space.git',
  ])('rejects %s', (url) => {
    expect(() => assertValidGitUrl(url)).toThrow();
  });
});
