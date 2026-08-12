import { Link } from 'react-router-dom';
import type { Project } from '../../types/project';
import { StatusBadge } from './StatusBadge';

const TYPE_LABELS: Record<Project['projectType'], string> = {
  docker: 'Docker',
  node: 'Node.js',
  python: 'Python',
  static: 'Statik',
  unknown: 'Bilinmiyor',
};

export function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      to={`/projects/${project.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:border-gray-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="truncate font-medium text-gray-900">{project.name}</h3>
        <StatusBadge status={project.status} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
        <span>{TYPE_LABELS[project.projectType]}</span>
        {project.port && <span>Port {project.port}</span>}
        {project.packageManager && <span>{project.packageManager}</span>}
      </div>
    </Link>
  );
}
