import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublishSection } from '../../src/components/project/PublishSection';
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

function stubFetch(handler: (url: string) => { status: number; body?: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string) => {
      const { status, body } = handler(url);
      return { status, ok: status >= 200 && status < 300, statusText: 'Test', json: async () => body };
    }),
  );
}

describe('PublishSection', () => {
  afterEach(() => {
    // This project's vitest config doesn't set `globals: true`, so
    // @testing-library/react's automatic afterEach(cleanup) never
    // self-registers - unmount explicitly or elements from earlier tests
    // (same button labels/text) stay in the DOM and get matched instead.
    cleanup();
    clearToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders a disabled hint when the server has no PANEL_DOMAIN configured', async () => {
    setToken('t');
    stubFetch(() => ({ status: 200, body: { status: 'ok', panelDomain: null } }));

    render(<PublishSection project={baseProject()} onProjectChange={() => {}} />);

    expect(await screen.findByText(/PANEL_DOMAIN ayarlanmamış/)).toBeInTheDocument();
  });

  it('shows a publish button for a running, unpublished project once PANEL_DOMAIN is known', async () => {
    setToken('t');
    stubFetch(() => ({ status: 200, body: { status: 'ok', panelDomain: 'panel.example.com' } }));

    render(<PublishSection project={baseProject()} onProjectChange={() => {}} />);

    expect(await screen.findByRole('button', { name: 'Yayınla' })).toBeInTheDocument();
  });

  it('publishes and shows the resulting URL', async () => {
    setToken('t');
    const onProjectChange = vi.fn();
    stubFetch((url) => {
      if (url === '/api/health') return { status: 200, body: { status: 'ok', panelDomain: 'panel.example.com' } };
      if (url === '/api/projects/1/publish') {
        return {
          status: 200,
          body: { project: baseProject({ subdomain: 'demo' }), url: 'https://demo.panel.example.com' },
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<PublishSection project={baseProject()} onProjectChange={onProjectChange} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Yayınla' }));

    await waitFor(() => expect(onProjectChange).toHaveBeenCalledWith(expect.objectContaining({ subdomain: 'demo' })));
  });

  it('shows the public URL and an unpublish action for an already-published project', async () => {
    setToken('t');
    stubFetch(() => ({ status: 200, body: { status: 'ok', panelDomain: 'panel.example.com' } }));

    render(<PublishSection project={baseProject({ subdomain: 'demo' })} onProjectChange={() => {}} />);

    expect(await screen.findByText('https://demo.panel.example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Yayından Kaldır' })).toBeInTheDocument();
  });

  it('renders nothing for a not-yet-running, unpublished project', async () => {
    setToken('t');
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      statusText: 'Test',
      json: async () => ({ status: 'ok', panelDomain: 'panel.example.com' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { container } = render(<PublishSection project={baseProject({ status: 'idle' })} onProjectChange={() => {}} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // Health resolved (panelDomain known) but there's nothing publish-related to show yet.
    expect(container).toBeEmptyDOMElement();
  });
});
