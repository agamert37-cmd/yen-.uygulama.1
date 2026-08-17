import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, ApiError } from '../api/client';
import { EnvTab } from '../components/project/tabs/EnvTab';
import { OverviewTab } from '../components/project/tabs/OverviewTab';
import { StatusBadge } from '../components/project/StatusBadge';
import { useProjectRoom } from '../hooks/useProjectRoom';
import { useSocket } from '../hooks/useSocket';
import { useSocketStatus } from '../hooks/useSocketStatus';
import type { Project, ProjectStatus } from '../types/project';

// xterm.js and Monaco are both large; only one tab is visible at a time,
// so load them on demand instead of bloating every page's initial bundle.
const LogsTab = lazy(() => import('../components/project/tabs/LogsTab').then((m) => ({ default: m.LogsTab })));
const FilesTab = lazy(() => import('../components/project/tabs/FilesTab').then((m) => ({ default: m.FilesTab })));

type TabKey = 'overview' | 'logs' | 'files' | 'env';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'overview', label: 'Genel Bakış' },
  { key: 'logs', label: 'Loglar' },
  { key: 'files', label: 'Dosyalar' },
  { key: 'env', label: 'Ortam Değişkenleri' },
];

interface StatusChangeEvent {
  projectId: string;
  status: ProjectStatus;
  message: string | null;
}

export function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const socket = useSocket();
  const socketStatus = useSocketStatus();
  const [project, setProject] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [reloadToken, setReloadToken] = useState(0);

  useProjectRoom(id ?? '');

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api
      .getProject(id)
      .then((data) => {
        if (!cancelled) setProject(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Proje yüklenemedi');
      });
    return () => {
      cancelled = true;
    };
  }, [id, reloadToken]);

  // Both the direct REST responses (start/stop/restart via onProjectChange)
  // and this socket listener write into the same `project` state, so
  // whichever arrives most recently wins - no separate "live status" value
  // that can end up stuck showing a stale snapshot if the socket happens to
  // deliver its first event after the REST call already updated the UI.
  useEffect(() => {
    if (!socket || !id) return;
    function onStatusChange(event: StatusChangeEvent): void {
      if (event.projectId !== id) return;
      setProject((prev) => (prev ? { ...prev, status: event.status, statusMessage: event.message } : prev));
    }
    socket.on('status:change', onStatusChange);
    return () => {
      socket.off('status:change', onStatusChange);
    };
  }, [socket, id]);

  if (!id) return null;
  if (error) {
    return (
      <div>
        <Link to="/" className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-700">
          ← Projeler
        </Link>
        <p className="text-sm text-red-600">{error}</p>
        <button
          type="button"
          onClick={() => {
            setError(null);
            setReloadToken((t) => t + 1);
          }}
          className="mt-2 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Tekrar Dene
        </button>
      </div>
    );
  }
  if (!project) return <p className="text-sm text-gray-500">Yükleniyor...</p>;

  return (
    <div>
      <Link to="/" className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-700">
        ← Projeler
      </Link>

      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="truncate text-xl font-semibold text-gray-900">{project.name}</h1>
        <StatusBadge status={project.status} />
      </div>

      {socketStatus === 'disconnected' && (
        <div className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Bağlantı koptu, yeniden bağlanılıyor...
        </div>
      )}

      <div
        role="tablist"
        className="mb-6 flex gap-1 overflow-x-auto border-b border-gray-200 [mask-image:linear-gradient(to_right,black_calc(100%-20px),transparent)]"
      >
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <OverviewTab project={project} onProjectChange={setProject} />}
      {tab === 'logs' && (
        <Suspense fallback={<p className="text-sm text-gray-500">Yükleniyor...</p>}>
          <LogsTab projectId={project.id} />
        </Suspense>
      )}
      {tab === 'files' && (
        <Suspense fallback={<p className="text-sm text-gray-500">Yükleniyor...</p>}>
          <FilesTab projectId={project.id} />
        </Suspense>
      )}
      {tab === 'env' && <EnvTab project={project} onProjectChange={setProject} />}
    </div>
  );
}
