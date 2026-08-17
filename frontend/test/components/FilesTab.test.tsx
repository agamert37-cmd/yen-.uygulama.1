import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setToken, clearToken } from '../../src/api/client';
import type { DirEntry } from '../../src/types/project';

vi.mock('../../src/components/editor/MonacoEditor', () => ({
  MonacoEditor: ({ onChange }: { path: string; value: string; onChange: (value: string) => void }) => (
    <textarea data-testid="monaco-stub" onChange={(event) => onChange(event.target.value)} />
  ),
}));

// Imported after the mock above so FilesTab picks up the mocked MonacoEditor.
const { FilesTab } = await import('../../src/components/project/tabs/FilesTab');

const FILES: DirEntry[] = [
  { name: 'a.txt', type: 'file', size: 1, modifiedAt: '' },
  { name: 'b.txt', type: 'file', size: 1, modifiedAt: '' },
];

function stubFetch(handler: (url: string, options: RequestInit) => { status: number; body?: unknown }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (url: string, options: RequestInit = {}) => {
      const { status, body } = handler(url, options);
      return { status, ok: status >= 200 && status < 300, statusText: 'Test', json: async () => body };
    }),
  );
}

describe('FilesTab', () => {
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

  it('distinguishes loading from a genuinely empty directory', async () => {
    setToken('t');
    let resolveList: ((entries: DirEntry[]) => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        async () =>
          new Promise((resolve) => {
            resolveList = (entries) =>
              resolve({ status: 200, ok: true, statusText: 'OK', json: async () => entries });
          }),
      ),
    );

    render(<FilesTab projectId="p1" />);

    expect(await screen.findByText('Yükleniyor...')).toBeInTheDocument();
    expect(screen.queryByText('Boş')).not.toBeInTheDocument();

    resolveList?.([]);
    await waitFor(() => expect(screen.getByText('Boş')).toBeInTheDocument());
    expect(screen.queryByText('Yükleniyor...')).not.toBeInTheDocument();
  });

  it('confirms before discarding an unsaved edit when switching files', async () => {
    setToken('t');
    stubFetch((url) => {
      if (url.includes('/files?path=')) return { status: 200, body: FILES };
      if (url.includes('path=a.txt')) return { status: 200, body: { path: 'a.txt', content: 'from a' } };
      if (url.includes('path=b.txt')) return { status: 200, body: { path: 'b.txt', content: 'from b' } };
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<FilesTab projectId="p1" />);
    // Matched on the file emoji + name so this doesn't also pick up the
    // sibling delete button, whose accessible name (from aria-label) is
    // `"a.txt" öğesini sil` and would otherwise also contain "a.txt".
    await userEvent.click(await screen.findByRole('button', { name: /📄 a\.txt/ }));
    expect(await screen.findByText('a.txt')).toBeInTheDocument();

    await userEvent.type(screen.getByTestId('monaco-stub'), 'x');

    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    await userEvent.click(screen.getByRole('button', { name: /📄 b\.txt/ }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByText('a.txt')).toBeInTheDocument();

    confirmSpy.mockReturnValue(true);
    await userEvent.click(screen.getByRole('button', { name: /📄 b\.txt/ }));
    expect(await screen.findByText('b.txt')).toBeInTheDocument();
  });

  it('gives each delete button an accessible name', async () => {
    setToken('t');
    stubFetch((url) => {
      if (url.includes('/files?path=')) return { status: 200, body: FILES };
      throw new Error(`unexpected fetch: ${url}`);
    });

    render(<FilesTab projectId="p1" />);

    expect(await screen.findByRole('button', { name: '"a.txt" öğesini sil' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '"b.txt" öğesini sil' })).toBeInTheDocument();
  });
});
