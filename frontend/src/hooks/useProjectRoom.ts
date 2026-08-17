import { useEffect } from 'react';
import { useSocket } from './useSocket';

/**
 * Owns join:project/leave:project for a project's whole viewing session
 * (call once, e.g. from ProjectDetailPage). useProjectLogs/useProjectStats
 * are pure listeners that assume the room is already joined - if each of
 * them also emitted join/leave independently, unmounting just one of them
 * (e.g. switching away from the Logs tab while Overview's stats are still
 * shown) would leave the room for the *other* hook too, since Socket.io
 * room membership isn't reference-counted per hook.
 */
export function useProjectRoom(projectId: string): void {
  const socket = useSocket();

  useEffect(() => {
    if (!socket || !projectId) return;

    function join(): void {
      socket?.emit('join:project', { projectId });
    }

    // emit() before the handshake completes isn't reliably delivered, and
    // joining on 'connect' also covers reconnects - server-side room
    // membership doesn't survive a dropped connection either.
    if (socket.connected) join();
    socket.on('connect', join);

    return () => {
      socket.off('connect', join);
      socket.emit('leave:project', { projectId });
    };
  }, [socket, projectId]);
}
