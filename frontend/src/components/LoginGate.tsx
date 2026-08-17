import { useState, type FormEvent, type ReactNode } from 'react';
import { getToken, setToken as persistToken } from '../api/client';

async function verifyToken(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } });
    return res.ok;
  } catch {
    return false;
  }
}

export function LoginGate({ children }: { children: (token: string) => ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    setChecking(true);
    const trimmed = input.trim();
    const ok = await verifyToken(trimmed);
    setChecking(false);
    if (!ok) {
      setError('Geçersiz token');
      return;
    }
    persistToken(trimmed);
    setTokenState(trimmed);
  }

  if (token) return <>{children(token)}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold text-gray-900">Hosting Panel</h1>
        <p className="mb-4 text-sm text-gray-500">Devam etmek için panel token&apos;ınızı girin.</p>
        <input
          type="password"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="PANEL_AUTH_TOKEN"
          className="mb-3 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
          autoFocus
        />
        {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={checking || input.trim() === ''}
          className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {checking ? 'Doğrulanıyor...' : 'Giriş Yap'}
        </button>
      </form>
    </div>
  );
}
