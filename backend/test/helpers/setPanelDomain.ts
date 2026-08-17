// Side-effect-only module: import this as the FIRST import in a test file
// (before `../../src/config/env` or anything that transitively imports it,
// e.g. `../../src/app`) to get PANEL_DOMAIN set for that file. Import
// statements execute in the order they're written, so this runs before the
// rest of the file's imports even though `setupEnv.ts` (which does not set
// PANEL_DOMAIN) already ran first. See setupEnv.ts's own comment for why a
// plain top-of-file `process.env.X = ...` assignment does NOT work here -
// ES module imports are hoisted ahead of ordinary statements, but this is
// itself an import, so it participates in that hoisted, ordered sequence.
process.env.PANEL_DOMAIN = 'panel.test.local';
