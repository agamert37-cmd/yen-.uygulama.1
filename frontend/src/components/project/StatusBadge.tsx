import type { ProjectStatus } from '../../types/project';

const STATUS_STYLES: Record<ProjectStatus, string> = {
  idle: 'bg-gray-100 text-gray-700',
  importing: 'bg-blue-100 text-blue-700',
  detecting: 'bg-blue-100 text-blue-700',
  installing: 'bg-amber-100 text-amber-700',
  building: 'bg-amber-100 text-amber-700',
  starting: 'bg-amber-100 text-amber-700',
  running: 'bg-green-100 text-green-700',
  stopping: 'bg-amber-100 text-amber-700',
  stopped: 'bg-gray-100 text-gray-700',
  error: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<ProjectStatus, string> = {
  idle: 'Boşta',
  importing: 'İçe Aktarılıyor',
  detecting: 'Tespit Ediliyor',
  installing: 'Kuruluyor',
  building: 'Derleniyor',
  starting: 'Başlatılıyor',
  running: 'Çalışıyor',
  stopping: 'Durduruluyor',
  stopped: 'Durduruldu',
  error: 'Hata',
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  const dotColor = status === 'running' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-current opacity-50';
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
