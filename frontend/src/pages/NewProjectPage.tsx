import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api/client';

type Mode = 'upload' | 'git';

export function NewProjectPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('upload');
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Proje adı gerekli');
      return;
    }
    if (mode === 'upload' && !file) {
      setError('Bir .zip veya .tar.gz dosyası seçin');
      return;
    }
    if (mode === 'git' && !repoUrl.trim()) {
      setError('Git deposu adresi gerekli');
      return;
    }

    setSubmitting(true);
    try {
      const project =
        mode === 'upload' ? await api.importUpload(name.trim(), file as File) : await api.importGit(name.trim(), repoUrl.trim());
      navigate(`/projects/${project.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'İçe aktarma başarısız oldu');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-900">Yeni Depo Oluştur</h1>

      <div className="mb-6 flex gap-2 rounded-lg bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === 'upload' ? 'bg-white text-gray-900 shadow' : 'text-gray-500'
          }`}
        >
          Zip / Tar.gz Yükle
        </button>
        <button
          type="button"
          onClick={() => setMode('git')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === 'git' ? 'bg-white text-gray-900 shadow' : 'text-gray-500'
          }`}
        >
          Git URL
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700">
            Proje Adı
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="eticaret-frontend"
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          />
        </div>

        {mode === 'upload' ? (
          <div>
            <label htmlFor="archive" className="block text-sm font-medium text-gray-700">
              Arşiv Dosyası
            </label>
            <input
              id="archive"
              type="file"
              accept=".zip,.tar.gz,.tgz"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-gray-800"
            />
          </div>
        ) : (
          <div>
            <label htmlFor="repoUrl" className="block text-sm font-medium text-gray-700">
              Git Deposu Adresi
            </label>
            <input
              id="repoUrl"
              type="text"
              value={repoUrl}
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/kullanici/depo.git"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {submitting ? 'İçe aktarılıyor...' : 'İçe Aktar'}
        </button>
      </form>
    </div>
  );
}
