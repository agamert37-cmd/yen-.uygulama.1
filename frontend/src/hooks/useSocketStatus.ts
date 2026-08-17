import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';

export type SocketStatus = 'connected' | 'disconnected';

export function useSocketStatus(): SocketStatus {
  const socket = useSocket();
  const [status, setStatus] = useState<SocketStatus>(socket?.connected ? 'connected' : 'disconnected');

  // Reset during render rather than in an effect (the same pattern
  // useProjectStats uses for trackedProjectId) - keeps status in sync the
  // instant the socket reference itself changes (e.g. null -> a socket
  // that's already connected by the time this component sees it), rather
  // than waiting on a future 'connect' event that may never fire again.
  const [trackedSocket, setTrackedSocket] = useState(socket);
  if (socket !== trackedSocket) {
    setTrackedSocket(socket);
    setStatus(socket?.connected ? 'connected' : 'disconnected');
  }

  useEffect(() => {
    if (!socket) return;
    const onConnect = (): void => setStatus('connected');
    const onDisconnect = (): void => setStatus('disconnected');
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onDisconnect);
    };
  }, [socket]);

  return status;
}
