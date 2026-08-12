import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { LogLine } from '../types/project';
import { useSocket } from './useSocket';

interface LogChunkEvent {
  projectId: string;
  stream: 'stdout' | 'stderr';
  data: string;
}

export function useProjectLogs(projectId: string): LogLine[] {
  const socket = useSocket();
  const [lines, setLines] = useState<LogLine[]>([]);

  // Reset during render (see useProjectStats for why), then fetch the
  // buffered tail as a genuine effect - fetching is exactly what effects
  // are for, it's the synchronous reset that doesn't belong in one.
  const [trackedProjectId, setTrackedProjectId] = useState(projectId);
  if (projectId !== trackedProjectId) {
    setTrackedProjectId(projectId);
    setLines([]);
  }

  useEffect(() => {
    let cancelled = false;
    api
      .getLogs(projectId)
      .then((initial) => {
        if (!cancelled) setLines(initial);
      })
      .catch(() => {
        // best-effort - live chunks will still arrive over the socket
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    if (!socket) return;
    function onChunk(event: LogChunkEvent): void {
      if (event.projectId !== projectId) return;
      setLines((prev) => [...prev, { stream: event.stream, data: event.data, ts: Date.now() }]);
    }
    socket.on('log:chunk', onChunk);
    return () => {
      socket.off('log:chunk', onChunk);
    };
  }, [socket, projectId]);

  return lines;
}
