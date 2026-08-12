import { useEffect, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SocketContext } from './socketContext';

export function SocketProvider({ token, children }: { token: string; children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);

  // Opening a connection is a side effect, so it belongs in an effect, not
  // in useMemo - useMemo's factory isn't guaranteed to run exactly once
  // (React intentionally invokes it twice under StrictMode to catch impure
  // use like this), which was silently leaking a connection that got
  // closed before it ever joined a project room. useEffect's mount/cleanup
  // pairing is what's actually designed to handle create-then-possibly-
  // recreate correctly.
  useEffect(() => {
    const s = io({ auth: { token }, transports: ['websocket'] });
    // Exposing an imperative connection object through context - by design
    // there's no external callback to defer this to, unlike the usual
    // "setState inside a subscription callback" shape this lint rule wants;
    // the effect *is* what's creating the thing being synchronized.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
    };
  }, [token]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
