import { useEffect, useState } from 'react';
import type { RuntimeStats } from '../types/project';
import { useSocket } from './useSocket';

interface StatsUpdateEvent {
  projectId: string;
  cpuPercent: number;
  memoryMb: number;
}

export function useProjectStats(projectId: string): RuntimeStats | null {
  const socket = useSocket();
  const [stats, setStats] = useState<RuntimeStats | null>(null);

  // Reset during render rather than in an effect (React's recommended
  // pattern for "adjust state when a prop changes") - avoids an extra
  // wasted render pass versus setState-at-the-top-of-a-useEffect.
  const [trackedProjectId, setTrackedProjectId] = useState(projectId);
  if (projectId !== trackedProjectId) {
    setTrackedProjectId(projectId);
    setStats(null);
  }

  useEffect(() => {
    if (!socket) return;
    function onUpdate(event: StatsUpdateEvent): void {
      if (event.projectId !== projectId) return;
      setStats({ cpuPercent: event.cpuPercent, memoryMb: event.memoryMb });
    }
    socket.on('stats:update', onUpdate);
    return () => {
      socket.off('stats:update', onUpdate);
    };
  }, [socket, projectId]);

  return stats;
}
