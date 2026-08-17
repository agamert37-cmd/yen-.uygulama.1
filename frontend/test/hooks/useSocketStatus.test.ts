import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { Socket } from 'socket.io-client';
import { SocketContext } from '../../src/hooks/socketContext';
import { useSocketStatus } from '../../src/hooks/useSocketStatus';

function fakeSocket(connected: boolean): { socket: Socket; handlers: Record<string, () => void> } {
  const handlers: Record<string, () => void> = {};
  const socket = {
    connected,
    on: vi.fn((event: string, handler: () => void) => {
      handlers[event] = handler;
    }),
    off: vi.fn(),
  } as unknown as Socket;
  return { socket, handlers };
}

function wrapper(socket: Socket | null) {
  return ({ children }: { children: ReactNode }) => createElement(SocketContext.Provider, { value: socket }, children);
}

describe('useSocketStatus', () => {
  it('reports disconnected when there is no socket yet', () => {
    const { result } = renderHook(() => useSocketStatus(), { wrapper: wrapper(null) });
    expect(result.current).toBe('disconnected');
  });

  it('reports connected for an already-connected socket', () => {
    const { socket } = fakeSocket(true);
    const { result } = renderHook(() => useSocketStatus(), { wrapper: wrapper(socket) });
    expect(result.current).toBe('connected');
  });

  it('flips to disconnected when the socket emits disconnect', () => {
    const { socket, handlers } = fakeSocket(true);
    const { result } = renderHook(() => useSocketStatus(), { wrapper: wrapper(socket) });
    expect(result.current).toBe('connected');

    act(() => {
      handlers.disconnect?.();
    });
    expect(result.current).toBe('disconnected');
  });

  it('flips back to connected when the socket emits connect', () => {
    const { socket, handlers } = fakeSocket(false);
    const { result } = renderHook(() => useSocketStatus(), { wrapper: wrapper(socket) });
    expect(result.current).toBe('disconnected');

    act(() => {
      handlers.connect?.();
    });
    expect(result.current).toBe('connected');
  });
});
