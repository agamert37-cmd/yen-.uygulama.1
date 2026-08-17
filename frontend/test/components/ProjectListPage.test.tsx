import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProjectListPage } from '../../src/pages/ProjectListPage';
import { setToken, clearToken } from '../../src/api/client';
import type { Project } from '../../src/types/project';

function baseProject(overrides: Partial<Project> = {}): Project {
  return {
    id: '1',
    name: 'Demo',
    slug: 'demo',
    dirPath: 'demo',
    sourceType: 'upload',
    sourceRef: null,
    projectType: 'node',
    packageManager: 'npm',
    hasComposeFile: false,
    port: 3000,
    status: 'idle',
    statusMessage: null,
    pm2ProcessName: null,
    composeProjectName: null,
    subdomain: null,
    envVars: {},
    createdAt: '',
    updatedAt: '',
    ...overrides,
  };
}

describe('ProjectListPage', () => {
  // This project's vitest config doesn't set `globals: true`, so
  // @testing-library/react's automatic afterEach(cleanup) never
  // self-registers - unmount explicitly or elements from earlier tests
  // stay in the DOM and get matched instead.
  afterEach(() => {
    cleanup();
    clearToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows an error and a retry action when the list fails to load', async () => {
    setToken('t');
    const fetchMock = vi.fn().mockResolvedValueOnce({
      status: 500,
      ok: false,
      statusText: 'Server Error',
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      <MemoryRouter>
        <ProjectListPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Server Error')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: 'Tekrar Dene' });

    fetchMock.mockResolvedValueOnce({
      status: 200,
      ok: true,
      statusText: 'OK',
      json: async () => [baseProject()],
    });
    await userEvent.click(retryButton);

    await waitFor(() => expect(screen.getByText('Demo')).toBeInTheDocument());
    expect(screen.queryByText('Server Error')).not.toBeInTheDocument();
  });
});
