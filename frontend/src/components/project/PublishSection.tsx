import { lazy, Suspense, useEffect, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { Project } from '../../types/project';

// qrcode.react pulls in its own canvas/SVG rendering weight; only worth
// loading once a project actually has a public URL to show a code for.
const QrCode = lazy(() => import('qrcode.react').then((m) => ({ default: m.QRCodeSVG })));

interface Props {
  project: Project;
  onProjectChange: (project: Project) => void;
}

export function PublishSection({ project, onProjectChange }: Props) {
  const [panelDomain, setPanelDomain] = useState<string | null | undefined>(undefined);
  const [subdomainInput, setSubdomainInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .health()
      .then((res) => {
        if (!cancelled) setPanelDomain(res.panelDomain);
      })
      .catch(() => {
        if (!cancelled) setPanelDomain(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function publish(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const trimmed = subdomainInput.trim();
      const { project: updated } = await api.publishProject(project.id, trimmed === '' ? undefined : trimmed);
      onProjectChange(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yayınlama başarısız oldu');
    } finally {
      setBusy(false);
    }
  }

  async function unpublish(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const updated = await api.unpublishProject(project.id);
      onProjectChange(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Yayından kaldırma başarısız oldu');
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(url: string): Promise<void> {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Still resolving GET /api/health - avoid flashing either state first.
  if (panelDomain === undefined) return null;

  if (panelDomain === null) {
    return (
      <p className="text-xs text-gray-400">
        Herkese açık yayın için sunucuda PANEL_DOMAIN ayarlanmamış.
      </p>
    );
  }

  if (project.status !== 'running' && !project.subdomain) return null;

  const url = project.subdomain ? `https://${project.subdomain}.${panelDomain}` : null;

  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-medium text-gray-900">Herkese Açık Yayın</h3>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      {url ? (
        <div className="mt-3 space-y-3">
          {project.status !== 'running' && (
            <p className="text-xs text-amber-700">
              Proje şu an çalışmıyor - link yeniden başlatılana kadar 404 verir.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <a href={url} target="_blank" rel="noreferrer" className="break-all text-sm text-blue-600 hover:underline">
              {url}
            </a>
            <button
              type="button"
              onClick={() => copyUrl(url)}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              {copied ? 'Kopyalandı' : 'Kopyala'}
            </button>
            <button
              type="button"
              onClick={unpublish}
              disabled={busy}
              className="rounded-md border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Yayından Kaldır
            </button>
          </div>
          <Suspense fallback={null}>
            <QrCode value={url} size={128} />
          </Suspense>
          <p className="text-xs text-gray-500">Telefondan açmak için QR kodu okutun.</p>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={subdomainInput}
            onChange={(event) => setSubdomainInput(event.target.value)}
            placeholder={project.slug}
            className="block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={publish}
            disabled={busy}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Yayınla
          </button>
        </div>
      )}
    </div>
  );
}
