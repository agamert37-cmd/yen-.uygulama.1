import { useProjectLogs } from '../../../hooks/useProjectLogs';
import { XtermLogViewer } from '../../terminal/XtermLogViewer';

export function LogsTab({ projectId }: { projectId: string }) {
  const lines = useProjectLogs(projectId);
  return <XtermLogViewer lines={lines} />;
}
