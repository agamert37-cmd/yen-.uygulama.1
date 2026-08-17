ALTER TABLE projects ADD COLUMN subdomain TEXT;

-- SQLite's ALTER TABLE ADD COLUMN cannot carry an inline UNIQUE constraint
-- (unlike CREATE TABLE, where slug/name use one) - enforce it via a
-- separate index instead. SQLite treats NULL as distinct from every other
-- NULL in a UNIQUE index, so any number of unpublished (subdomain IS NULL)
-- projects coexist fine; only non-null values collide.
CREATE UNIQUE INDEX idx_projects_subdomain ON projects(subdomain);
