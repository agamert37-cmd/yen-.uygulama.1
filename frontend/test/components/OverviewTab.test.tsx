import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OverviewTab } from '../../src/components/project/tabs/OverviewTab';
import { setToken, clearToken } from '../../src/api/client';
import type { Project } from '../../src/types/project';

function stubApiFetch(handler: (url: string, options: RequestInit) => { status: number; body?: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, options: RequestInit = {}) => {
      if (url === '/api/health') {
        return { status: 200, ok: true, statusText: 'OK', json: async () => ({ status: 'ok', panelDomain: null }) };
      }
      const { status, body } = handler(url, options);
      return { status, ok: status >= 200 && status < 300, statusText: 'Test', json: async () => body };
    }),
  );
}

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
    status: 'running',
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

describe('OverviewTab', () => {
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

  it('shows a saving state on the port button while the patch is pending', async () => {
    setToken('t');
    let resolvePatch: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (url: string) => {
        if (url === '/api/health') {
          return { status: 200, ok: true, statusText: 'OK', json: async () => ({ status: 'ok', panelDomain: null }) };
        }
        if (url === '/api/projects/1') {
          return new Promise((resolve) => {
            resolvePatch = () =>
              resolve({ status: 200, ok: true, statusText: 'OK', json: async () => baseProject({ port: 4000 }) });
          });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    render(
      <MemoryRouter>
        <OverviewTab project={baseProject()} onProjectChange={() => {}} />
      </MemoryRouter>,
    );

    const saveButton = await screen.findByRole('button', { name: 'Kaydet' });
    await userEvent.click(saveButton);

    expect(await screen.findByRole('button', { name: 'Kaydediliyor...' })).toBeDisabled();

    resolvePatch?.();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Kaydet' })).not.toBeDisabled());
  });

  it('disables re-detect and delete while the project is running', async () => {
    setToken('t');
    stubApiFetch(() => {
      throw new Error('should not call the API while these buttons are disabled');
    });

    render(
      <MemoryRouter>
        <OverviewTab project={baseProject({ status: 'running' })} onProjectChange={() => {}} />
      </MemoryRouter>,
    );

    // The backend rejects both re-detect (B4) and delete (B1) while the
    // project is running, not just mid-transition - the buttons must be
    // disabled to match, or a click just surfaces a raw 409 instead.
    expect(await screen.findByRole('button', { name: 'Yeniden Algıla' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Projeyi Sil' })).toBeDisabled();
  });

  it('redetects the project type and applies the update', async () => {
    setToken('t');
    const onProjectChange = vi.fn();
    stubApiFetch((url, options) => {
      if (url === '/api/projects/1/detect' && options.method === 'POST') {
        return { status: 200, body: baseProject({ projectType: 'docker' }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(
      <MemoryRouter>
        <OverviewTab project={baseProject({ status: 'stopped' })} onProjectChange={onProjectChange} />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Yeniden Algıla' }));

    await waitFor(() =>
      expect(onProjectChange).toHaveBeenCalledWith(expect.objectContaining({ projectType: 'docker' })),
    );
  });

  it('deletes the project and navigates to the list after confirming', async () => {
    setToken('t');
    const deleteSpy = vi.fn();
    stubApiFetch((url, options) => {
      if (url === '/api/projects/1' && options.method === 'DELETE') {
        deleteSpy();
        return { status: 204 };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={['/projects/1']}>
        <Routes>
          <Route path="/" element={<p>Project List Marker</p>} />
          <Route
            path="/projects/:id"
            element={<OverviewTab project={baseProject({ status: 'stopped' })} onProjectChange={() => {}} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Projeyi Sil' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalled());
    expect(await screen.findByText('Project List Marker')).toBeInTheDocument();
  });

  it('does not delete the project when the confirmation is dismissed', async () => {
    setToken('t');
    const deleteSpy = vi.fn();
    stubApiFetch((url, options) => {
      if (url === '/api/projects/1' && options.method === 'DELETE') {
        deleteSpy();
        return { status: 204 };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <MemoryRouter>
        <OverviewTab project={baseProject({ status: 'stopped' })} onProjectChange={() => {}} />
      </MemoryRouter>,
    );

    await userEvent.click(await screen.findByRole('button', { name: 'Projeyi Sil' }));

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});
