import { randomUUID } from 'node:crypto';
import { db } from '../index';
import type {
  DeployEvent,
  PackageManager,
  Project,
  ProjectStatus,
  ProjectType,
  SourceType,
} from '../../types/project';

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  dir_path: string;
  source_type: string;
  source_ref: string | null;
  project_type: string;
  package_manager: string | null;
  has_compose_file: number;
  port: number | null;
  status: string;
  status_message: string | null;
  pm2_process_name: string | null;
  compose_project_name: string | null;
  env_vars: string;
  created_at: string;
  updated_at: string;
}

interface DeployEventRow {
  id: number;
  phase: string;
  message: string | null;
  created_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    dirPath: row.dir_path,
    sourceType: row.source_type as SourceType,
    sourceRef: row.source_ref,
    projectType: row.project_type as ProjectType,
    packageManager: row.package_manager as PackageManager | null,
    hasComposeFile: row.has_compose_file === 1,
    port: row.port,
    status: row.status as ProjectStatus,
    statusMessage: row.status_message,
    pm2ProcessName: row.pm2_process_name,
    composeProjectName: row.compose_project_name,
    envVars: JSON.parse(row.env_vars) as Record<string, string>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateProjectInput {
  name: string;
  slug: string;
  dirPath: string;
  sourceType: SourceType;
  sourceRef?: string | null;
}

export interface UpdateProjectPatch {
  name?: string;
  port?: number | null;
  envVars?: Record<string, string>;
  projectType?: ProjectType;
  packageManager?: PackageManager | null;
  hasComposeFile?: boolean;
  status?: ProjectStatus;
  statusMessage?: string | null;
  pm2ProcessName?: string | null;
  composeProjectName?: string | null;
}

const SELECT_ALL = 'SELECT * FROM projects ORDER BY created_at DESC';
const SELECT_BY_ID = 'SELECT * FROM projects WHERE id = ?';
const SELECT_BY_SLUG = 'SELECT * FROM projects WHERE slug = ?';

export const projectsRepo = {
  create(input: CreateProjectInput): Project {
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      `
      INSERT INTO projects (
        id, name, slug, dir_path, source_type, source_ref,
        project_type, package_manager, has_compose_file, port,
        status, status_message, pm2_process_name, compose_project_name,
        env_vars, created_at, updated_at
      ) VALUES (
        @id, @name, @slug, @dirPath, @sourceType, @sourceRef,
        'unknown', NULL, 0, NULL,
        'idle', NULL, NULL, NULL,
        '{}', @now, @now
      )
      `,
    ).run({
      id,
      name: input.name,
      slug: input.slug,
      dirPath: input.dirPath,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef ?? null,
      now,
    });
    const created = projectsRepo.findById(id);
    if (!created) throw new Error('Failed to read back newly created project');
    return created;
  },

  findAll(): Project[] {
    return (db.prepare(SELECT_ALL).all() as ProjectRow[]).map(rowToProject);
  },

  findById(id: string): Project | undefined {
    const row = db.prepare(SELECT_BY_ID).get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : undefined;
  },

  findBySlug(slug: string): Project | undefined {
    const row = db.prepare(SELECT_BY_SLUG).get(slug) as ProjectRow | undefined;
    return row ? rowToProject(row) : undefined;
  },

  update(id: string, patch: UpdateProjectPatch): Project | undefined {
    const existing = projectsRepo.findById(id);
    if (!existing) return undefined;

    const next = {
      name: patch.name ?? existing.name,
      port: patch.port === undefined ? existing.port : patch.port,
      envVars: patch.envVars ?? existing.envVars,
      projectType: patch.projectType ?? existing.projectType,
      packageManager:
        patch.packageManager === undefined ? existing.packageManager : patch.packageManager,
      hasComposeFile: patch.hasComposeFile ?? existing.hasComposeFile,
      status: patch.status ?? existing.status,
      statusMessage:
        patch.statusMessage === undefined ? existing.statusMessage : patch.statusMessage,
      pm2ProcessName:
        patch.pm2ProcessName === undefined ? existing.pm2ProcessName : patch.pm2ProcessName,
      composeProjectName:
        patch.composeProjectName === undefined
          ? existing.composeProjectName
          : patch.composeProjectName,
    };

    db.prepare(
      `
      UPDATE projects SET
        name = @name,
        port = @port,
        env_vars = @envVars,
        project_type = @projectType,
        package_manager = @packageManager,
        has_compose_file = @hasComposeFile,
        status = @status,
        status_message = @statusMessage,
        pm2_process_name = @pm2ProcessName,
        compose_project_name = @composeProjectName,
        updated_at = @updatedAt
      WHERE id = @id
      `,
    ).run({
      id,
      name: next.name,
      port: next.port,
      envVars: JSON.stringify(next.envVars),
      projectType: next.projectType,
      packageManager: next.packageManager,
      hasComposeFile: next.hasComposeFile ? 1 : 0,
      status: next.status,
      statusMessage: next.statusMessage,
      pm2ProcessName: next.pm2ProcessName,
      composeProjectName: next.composeProjectName,
      updatedAt: new Date().toISOString(),
    });

    return projectsRepo.findById(id);
  },

  remove(id: string): boolean {
    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  },

  addDeployEvent(projectId: string, phase: string, message?: string | null): void {
    db.prepare(
      `INSERT INTO deploy_events (project_id, phase, message, created_at) VALUES (?, ?, ?, ?)`,
    ).run(projectId, phase, message ?? null, new Date().toISOString());

    // Keep only the most recent 50 events per project (bounded "recent activity" trail).
    db.prepare(
      `
      DELETE FROM deploy_events
      WHERE project_id = ? AND id NOT IN (
        SELECT id FROM deploy_events WHERE project_id = ? ORDER BY id DESC LIMIT 50
      )
      `,
    ).run(projectId, projectId);
  },

  listDeployEvents(projectId: string): DeployEvent[] {
    return (
      db
        .prepare(
          `SELECT id, phase, message, created_at FROM deploy_events
           WHERE project_id = ? ORDER BY id DESC LIMIT 50`,
        )
        .all(projectId) as DeployEventRow[]
    ).map((row) => ({
      id: row.id,
      phase: row.phase,
      message: row.message,
      createdAt: row.created_at,
    }));
  },
};
