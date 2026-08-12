import { useContext } from 'react';
import type { Socket } from 'socket.io-client';
import { SocketContext } from './socketContext';

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}
