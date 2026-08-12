import { useEffect, useState } from 'react';
import { api, ApiError } from '../../../api/client';
import type { DirEntry } from '../../../types/project';
import { MonacoEditor } from '../../editor/MonacoEditor';

function joinPath(dir: string, name: string): string {
  return dir === '.' ? name : `${dir}/${name}`;
}

export function FilesTab({ projectId }: { projectId: string }) {
  const [currentPath, setCurrentPath] = useState('.');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .listFiles(projectId, currentPath)
      .then((result) => {
        setEntries(result);
        setError(null);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : 'Dizin listelenemedi'));
  }, [projectId, currentPath]);

  function goUp(): void {
    if (currentPath === '.') return;
    const parts = currentPath.split('/');
    parts.pop();
    setCurrentPath(parts.length === 0 ? '.' : parts.join('/'));
  }

  async function openFile(name: string): Promise<void> {
    const filePath = joinPath(currentPath, name);
    setError(null);
    try {
      const result = await api.readFile(projectId, filePath);
      setSelectedFile(filePath);
      setContent(result.content);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Dosya açılamadı');
    }
  }

  async function save(): Promise<void> {
    if (!selectedFile) return;
    setSaving(true);
    setError(null);
    try {
      await api.writeFile(projectId, selectedFile, content);
      setDirty(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(name: string): Promise<void> {
    const targetPath = joinPath(currentPath, name);
    if (!window.confirm(`"${name}" silinsin mi?`)) return;
    try {
      await api.deleteFile(projectId, targetPath);
      setEntries(await api.listFiles(projectId, currentPath));
      if (selectedFile === targetPath) {
        setSelectedFile(null);
        setContent('');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Silinemedi');
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="rounded-lg border border-gray-200 lg:col-span-1">
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <span className="truncate text-sm text-gray-500">/{currentPath === '.' ? '' : currentPath}</span>
          {currentPath !== '.' && (
            <button type="button" onClick={goUp} className="shrink-0 text-sm text-gray-500 hover:text-gray-700">
              ↑ Yukarı
            </button>
          )}
        </div>
        <ul className="max-h-[500px] overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.name} className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-gray-50">
              <button
                type="button"
                onClick={() =>
                  entry.type === 'directory' ? setCurrentPath(joinPath(currentPath, entry.name)) : openFile(entry.name)
                }
                className="flex-1 truncate text-left text-gray-700"
              >
                {entry.type === 'directory' ? '📁' : '📄'} {entry.name}
              </button>
              <button
                type="button"
                onClick={() => removeEntry(entry.name)}
                className="ml-2 shrink-0 text-xs text-gray-400 hover:text-red-600"
                title="Sil"
              >
                ✕
              </button>
            </li>
          ))}
          {entries.length === 0 && <li className="px-3 py-4 text-center text-sm text-gray-400">Boş</li>}
        </ul>
      </div>

      <div className="lg:col-span-2">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {selectedFile ? (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="truncate text-sm font-medium text-gray-700">{selectedFile}</span>
              <button
                type="button"
                onClick={save}
                disabled={!dirty || saving}
                className="shrink-0 rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                {saving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
            <MonacoEditor
              path={selectedFile}
              value={content}
              onChange={(value) => {
                setContent(value);
                setDirty(true);
              }}
            />
          </div>
        ) : (
          <div className="flex h-[500px] items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400">
            Düzenlemek için bir dosya seçin
          </div>
        )}
      </div>
    </div>
  );
}
