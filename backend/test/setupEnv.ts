import crypto from 'node:crypto';

// Runs once per test file (Vitest setupFiles), before that file's own
// `import` statements evaluate. Always set explicit values here rather than
// `process.env.X || 'default'` - if a worker process gets reused across
// files, a `||` fallback would silently inherit a value left behind by
// whichever file ran before it instead of resetting to a clean default.
//
// WORKSPACES_ROOT gets a fresh random suffix on every run so that test
// files never collide on the same directory - a test file CANNOT override
// this by assigning process.env.WORKSPACES_ROOT above its own imports the
// way you might expect: ES module imports are hoisted and evaluate before
// any other top-level code in that file, so such an assignment runs too
// late (this was a real bug here: two integration test files each tried to
// claim their own workspace directory that way, silently failed, and ended
// up sharing - and deleting - each other's project directories mid-test).
process.env.NODE_ENV = 'test';
process.env.PANEL_AUTH_TOKEN = 'test-panel-auth-token-1234';
process.env.DB_PATH = ':memory:';
process.env.WORKSPACES_ROOT = `./.tmp-test-workspaces-${crypto.randomUUID()}`;
process.env.LOG_LEVEL = 'silent';
