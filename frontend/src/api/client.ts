import type { DeployEvent, DirEntry, LogLine, Project, RuntimeStats } from '../types/project';

const TOKEN_STORAGE_KEY = 'panel_auth_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    // Simplest reliable way back to the login screen from anywhere in the
    // tree - an expired/invalid token means nothing else on the page can
    // usefully continue anyway.
    window.location.reload();
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) message = body.message ? `${body.error}: ${body.message}` : body.error;
    } catch {
      // response wasn't JSON - fall back to statusText
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface ProjectPatch {
  name?: string;
  port?: number | null;
  envVars?: Record<string, string>;
}

export const api = {
  health: () => request<{ status: string; panelDomain: string | null }>('/health'),

  listProjects: () => request<Project[]>('/projects'),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  patchProject: (id: string, patch: ProjectPatch) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  redetectProject: (id: string) => request<Project>(`/projects/${id}/detect`, { method: 'POST' }),
  getEvents: (id: string) => request<DeployEvent[]>(`/projects/${id}/events`),

  importUpload: (name: string, file: File) => {
    const form = new FormData();
    form.append('name', name);
    form.append('archive', file);
    return request<Project>('/projects/import/upload', { method: 'POST', body: form });
  },
  importGit: (name: string, repoUrl: string) =>
    request<Project>('/projects/import/git', {
      method: 'POST',
      body: JSON.stringify({ name, repoUrl }),
    }),

  publishProject: (id: string, subdomain?: string) =>
    request<{ project: Project; url: string }>(`/projects/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify(subdomain ? { subdomain } : {}),
    }),
  unpublishProject: (id: string) => request<Project>(`/projects/${id}/publish`, { method: 'DELETE' }),

  startProject: (id: string) => request<Project>(`/projects/${id}/actions/start`, { method: 'POST' }),
  stopProject: (id: string) => request<Project>(`/projects/${id}/actions/stop`, { method: 'POST' }),
  restartProject: (id: string) => request<Project>(`/projects/${id}/actions/restart`, { method: 'POST' }),
  getLogs: (id: string, tail = 200) => request<LogLine[]>(`/projects/${id}/logs?tail=${tail}`),
  getStats: (id: string) => request<RuntimeStats>(`/projects/${id}/stats`),

  listFiles: (id: string, path = '.') =>
    request<DirEntry[]>(`/projects/${id}/files?path=${encodeURIComponent(path)}`),
  readFile: (id: string, path: string) =>
    request<{ path: string; content: string }>(`/projects/${id}/files/content?path=${encodeURIComponent(path)}`),
  writeFile: (id: string, path: string, content: string) =>
    request<void>(`/projects/${id}/files/content`, {
      method: 'PUT',
      body: JSON.stringify({ path, content }),
    }),
  deleteFile: (id: string, path: string) =>
    request<void>(`/projects/${id}/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
};
