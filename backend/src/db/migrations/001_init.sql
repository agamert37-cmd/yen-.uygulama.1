CREATE TABLE projects (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL UNIQUE,
  slug                  TEXT NOT NULL UNIQUE,
  dir_path              TEXT NOT NULL,
  source_type           TEXT NOT NULL CHECK (source_type IN ('upload', 'git')),
  source_ref            TEXT,
  project_type          TEXT NOT NULL DEFAULT 'unknown'
                         CHECK (project_type IN ('docker', 'node', 'python', 'static', 'unknown')),
  package_manager       TEXT CHECK (package_manager IN ('npm', 'yarn', 'pnpm')),
  has_compose_file      INTEGER NOT NULL DEFAULT 0,
  port                  INTEGER,
  status                TEXT NOT NULL DEFAULT 'idle'
                         CHECK (status IN ('idle', 'importing', 'detecting', 'installing',
                                            'building', 'starting', 'running', 'stopping',
                                            'stopped', 'error')),
  status_message        TEXT,
  pm2_process_name      TEXT,
  compose_project_name  TEXT,
  env_vars              TEXT NOT NULL DEFAULT '{}',
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL
);

CREATE TABLE deploy_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase       TEXT NOT NULL,
  message     TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_deploy_events_project_id ON deploy_events(project_id);
