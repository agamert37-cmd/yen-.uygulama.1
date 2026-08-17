import { useState } from 'react';
import { api, ApiError } from '../../../api/client';
import type { Project } from '../../../types/project';

interface Props {
  project: Project;
  onProjectChange: (project: Project) => void;
}

export function EnvTab({ project, onProjectChange }: Props) {
  const [rows, setRows] = useState<Array<{ key: string; value: string }>>(
    Object.entries(project.envVars).map(([key, value]) => ({ key, value })),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, field: 'key' | 'value', newValue: string): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: newValue } : row)));
  }

  function removeRow(index: number): void {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function addRow(): void {
    setRows((prev) => [...prev, { key: '', value: '' }]);
  }

  async function save(): Promise<void> {
    setError(null);
    const envVars: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (!key) continue;
      envVars[key] = row.value;
    }
    setSaving(true);
    try {
      const updated = await api.patchProject(project.id, { envVars });
      onProjectChange(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Buradaki değerler projenin .env dosyasına yazılır ve bir sonraki başlatmada kullanılır.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={row.key}
              onChange={(event) => updateRow(index, 'key', event.target.value)}
              placeholder="DATABASE_URL"
              className="w-1/3 rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-gray-500 focus:outline-none"
            />
            <input
              value={row.value}
              onChange={(event) => updateRow(index, 'value', event.target.value)}
              placeholder="değer"
              className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 font-mono text-sm focus:border-gray-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => removeRow(index)}
              aria-label={row.key ? `"${row.key}" değişkenini sil` : 'Değişkeni sil'}
              className="rounded px-2 py-1 text-gray-400 hover:text-red-600"
              title="Sil"
            >
              ✕
            </button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-gray-400">Henüz ortam değişkeni yok.</p>}
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={addRow}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          + Değişken Ekle
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Kaydediliyor...' : 'Kaydet'}
        </button>
      </div>
    </div>
  );
}
