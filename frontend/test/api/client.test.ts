import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, clearToken, getToken, setToken } from '../../src/api/client';

function stubFetchOnce(response: { status: number; body?: unknown }): ReturnType<typeof vi.fn> {
  const ok = response.status >= 200 && response.status < 300;
  const fetchMock = vi.fn().mockResolvedValue({
    status: response.status,
    ok,
    statusText: 'Test Status',
    json: async () => response.body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('token storage', () => {
  afterEach(() => {
    clearToken();
  });

  it('stores, retrieves, and clears the token', () => {
    expect(getToken()).toBeNull();
    setToken('abc123');
    expect(getToken()).toBe('abc123');
    clearToken();
    expect(getToken()).toBeNull();
  });
});

describe('api client requests', () => {
  beforeEach(() => {
    setToken('test-token');
  });

  afterEach(() => {
    clearToken();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('attaches the bearer token and returns parsed JSON on success', async () => {
    const fetchMock = stubFetchOnce({ status: 200, body: [{ id: '1', name: 'Demo' }] });
    const result = await api.listProjects();
    expect(result).toEqual([{ id: '1', name: 'Demo' }]);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/projects');
    expect((options.headers as Headers).get('Authorization')).toBe('Bearer test-token');
  });

  it('returns undefined for a 204 No Content response', async () => {
    stubFetchOnce({ status: 204 });
    const result = await api.deleteProject('1');
    expect(result).toBeUndefined();
  });

  it('throws ApiError with the server-provided message on a non-ok response', async () => {
    stubFetchOnce({ status: 409, body: { error: 'Conflict', message: 'already running' } });
    await expect(api.startProject('1')).rejects.toMatchObject({
      status: 409,
      message: 'Conflict: already running',
    });
  });

  it('clears the token and rejects with ApiError on a 401', async () => {
    // request() also calls window.location.reload() on a 401 to bounce back
    // to the login screen - not asserted here, since jsdom's `location`
    // resists reconfiguration/mocking in this version. The two outcomes
    // that matter for callers (token cleared, promise rejects) are.
    stubFetchOnce({ status: 401, body: { error: 'Unauthorized' } });
    await expect(api.listProjects()).rejects.toThrow(ApiError);
    expect(getToken()).toBeNull();
  });

  it('does not set a Content-Type header for FormData bodies', async () => {
    const fetchMock = stubFetchOnce({ status: 201, body: { id: '1' } });
    const file = new File(['content'], 'archive.zip');
    await api.importUpload('Demo', file);
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Headers).has('Content-Type')).toBe(false);
  });

  it('sets a JSON Content-Type header for plain object bodies', async () => {
    const fetchMock = stubFetchOnce({ status: 200, body: { id: '1' } });
    await api.patchProject('1', { port: 3000 });
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((options.headers as Headers).get('Content-Type')).toBe('application/json');
  });
});
