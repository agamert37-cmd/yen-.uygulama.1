import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../../api/client';
import { useProjectStats } from '../../../hooks/useProjectStats';
import type { Project, ProjectStatus, ProjectType } from '../../../types/project';
import { PublishSection } from '../PublishSection';

const TYPE_LABELS: Record<ProjectType, string> = {
  docker: 'Docker',
  node: 'Node.js',
  python: 'Python',
  static: 'Statik',
  unknown: 'Bilinmiyor',
};

const RUNNABLE_TYPES = new Set<ProjectType>(['docker', 'node']);
const BUSY_STATUSES = new Set<ProjectStatus>([
  'importing',
  'detecting',
  'installing',
  'building',
  'starting',
  'stopping',
]);

interface Props {
  project: Project;
  onProjectChange: (project: Project) => void;
}

export function OverviewTab({ project, onProjectChange }: Props) {
  const navigate = useNavigate();
  const stats = useProjectStats(project.id);
  const [portInput, setPortInput] = useState(project.port?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [savingPort, setSavingPort] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = RUNNABLE_TYPES.has(project.projectType);
  const isBusy = BUSY_STATUSES.has(project.status) || busy;
  // The backend rejects both re-detect and delete while running (not just
  // while mid-transition) - BUSY_STATUSES above deliberately excludes
  // 'running' for the start/stop/restart buttons, so it's checked
  // separately here rather than folded into isBusy.
  const cannotModifyLifecycle = isBusy || project.status === 'running';

  async function runAction(action: 'start' | 'stop' | 'restart'): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const fn =
        action === 'start' ? api.startProject : action === 'stop' ? api.stopProject : api.restartProject;
      const updated = await fn(project.id);
      onProjectChange(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İşlem başarısız oldu');
    } finally {
      setBusy(false);
    }
  }

  async function redetect(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.redetectProject(project.id);
      onProjectChange(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yeniden algılama başarısız oldu');
    } finally {
      setBusy(false);
    }
  }

  async function deleteProject(): Promise<void> {
    if (!window.confirm(`"${project.name}" silinsin mi? Bu işlem geri alınamaz.`)) return;
    setError(null);
    setBusy(true);
    try {
      await api.deleteProject(project.id);
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Proje silinemedi');
      setBusy(false);
    }
  }

  async function savePort(): Promise<void> {
    setError(null);
    const trimmed = portInput.trim();
    if (trimmed !== '' && !/^\d+$/.test(trimmed)) {
      setError('Port bir sayı olmalı');
      return;
    }
    const port = trimmed === '' ? null : Number(trimmed);
    setSavingPort(true);
    try {
      const updated = await api.patchProject(project.id, { port });
      onProjectChange(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Port güncellenemedi');
    } finally {
      setSavingPort(false);
    }
  }

  return (
    <div className="space-y-6">
      {!canRun && (
        <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
          {project.projectType === 'python' || project.projectType === 'static'
            ? `${TYPE_LABELS[project.projectType]} projeleri için çalıştırma bu sürümde henüz desteklenmiyor.`
            : 'Proje türü tespit edilemedi - dosyaları kontrol edip yeniden tespit deneyin.'}
        </div>
      )}

      {project.statusMessage && <p className="text-sm text-gray-500">{project.statusMessage}</p>}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => runAction('start')}
          disabled={!canRun || isBusy || project.status === 'running'}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Başlat
        </button>
        <button
          type="button"
          onClick={() => runAction('stop')}
          disabled={isBusy || project.status !== 'running'}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Durdur
        </button>
        <button
          type="button"
          onClick={() => runAction('restart')}
          disabled={isBusy || project.status !== 'running'}
          className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Yeniden Başlat
        </button>
        <button
          type="button"
          onClick={redetect}
          disabled={cannotModifyLifecycle}
          title={project.status === 'running' ? 'Yeniden algılamadan önce projeyi durdurun' : undefined}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Yeniden Algıla
        </button>
        <button
          type="button"
          onClick={deleteProject}
          disabled={cannotModifyLifecycle}
          title={project.status === 'running' ? 'Silmeden önce projeyi durdurun' : undefined}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Projeyi Sil
        </button>
      </div>

      <dl className="grid grid-cols-2 gap-4 rounded-lg border border-gray-200 p-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-gray-500">Tür</dt>
          <dd className="text-sm font-medium text-gray-900">{TYPE_LABELS[project.projectType]}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">Paket Yöneticisi</dt>
          <dd className="text-sm font-medium text-gray-900">{project.packageManager ?? '-'}</dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">CPU</dt>
          <dd className="text-sm font-medium text-gray-900">
            {stats ? `%${stats.cpuPercent.toFixed(1)}` : '-'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-gray-500">RAM</dt>
          <dd className="text-sm font-medium text-gray-900">{stats ? `${stats.memoryMb} MB` : '-'}</dd>
        </div>
      </dl>

      <div>
        <label htmlFor="port" className="block text-sm font-medium text-gray-700">
          Port
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="port"
            type="text"
            inputMode="numeric"
            value={portInput}
            onChange={(event) => setPortInput(event.target.value)}
            placeholder="3000"
            className="block w-40 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={savePort}
            disabled={savingPort}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {savingPort ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Port değişikliği bir sonraki başlatmada uygulanır.</p>
      </div>

      <PublishSection project={project} onProjectChange={onProjectChange} />
    </div>
  );
}
