import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { clearToken } from '../api/client';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-base font-semibold text-gray-900">
            Hosting Panel
          </Link>
          <button
            type="button"
            onClick={() => {
              clearToken();
              window.location.reload();
            }}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Çıkış Yap
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
