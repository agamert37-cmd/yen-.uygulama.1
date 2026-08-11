import simpleGit from 'simple-git';
import { HttpError } from '../../middleware/errorHandler';

// Only https://, http://, or `git@host:path` SSH-style URLs. Deliberately
// excludes file:// (would let the panel clone/exfiltrate arbitrary local
// paths on its own host) and anything else non-http(s)/ssh.
const GIT_URL_PATTERN = /^(https?:\/\/\S+|git@[\w.-]+:\S+)$/;

export function assertValidGitUrl(url: string): void {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2000) {
    throw new HttpError(400, 'Invalid git URL');
  }
  if (url.startsWith('-')) {
    // Defends against flag-injection into the git CLI (e.g. "--upload-pack=...")
    // even though execFile-style invocation already avoids shell parsing.
    throw new HttpError(400, 'Invalid git URL');
  }
  if (/\s/.test(url) || !GIT_URL_PATTERN.test(url)) {
    throw new HttpError(400, 'Only https://, http://, or git@host:path URLs are allowed');
  }
}

export async function cloneRepo(url: string, destDir: string): Promise<void> {
  assertValidGitUrl(url);
  const git = simpleGit();
  try {
    await git.clone(url, destDir, ['--depth', '1']);
  } catch (err) {
    throw new HttpError(400, `git clone failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
