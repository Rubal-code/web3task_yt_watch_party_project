
import { useEffect, useRef, useCallback, useState } from 'react';
import type { ClientEvent, ServerEvent } from '@/lib/types';
import { toast } from '@/lib/toast';

interface UseWatchSocketOptions {
  roomId: string;
  username: string;
  hostToken?: string;
  onEvent: (event: ServerEvent) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enabled?: boolean;
}

export function useWatchSocket({
  roomId,
  username,
  hostToken,
  onEvent,
  onConnect,
  onDisconnect,
  enabled = true,
}: UseWatchSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const callbacksRef = useRef({ onEvent, onConnect, onDisconnect });

  callbacksRef.current = { onEvent, onConnect, onDisconnect };

  const wsUrl = (
    import.meta.env.VITE_WS_URL || 'ws://localhost:8000'
  ).replace(/^http/, 'ws');

  // Send messages through the currently active socket.
  const send = useCallback((event: ClientEvent) => {
    const ws = wsRef.current;

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    } else {
      toast.error('Not connected to the room. Reconnecting...');
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let currentSocket: WebSocket | null = null;

    const connect = () => {
      if (disposed) return;

      const ws = new WebSocket(`${wsUrl}/ws/${roomId}`);
      currentSocket = ws;
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }

        reconnectAttempts = 0;
        setIsConnected(true);
        callbacksRef.current.onConnect?.();

        // Join or rejoin the room.
        ws.send(JSON.stringify({
          event: 'join_room',
          payload: {
            roomId,
            username,
            ...(hostToken ? { hostToken } : {}),
          },
        }));
      };

      ws.onmessage = (message) => {
        try {
          const parsed: ServerEvent = JSON.parse(message.data);
          callbacksRef.current.onEvent(parsed);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
          setIsConnected(false);
        }

        callbacksRef.current.onDisconnect?.();

        // Never reconnect after intentional cleanup.
        if (disposed) return;

        if (reconnectAttempts >= 10) {
          toast.error('Unable to reconnect. Please refresh.');
          return;
        }

        const delay = Math.min(
          1000 * 2 ** reconnectAttempts,
          30000
        );

        reconnectAttempts++;

        toast.info(`Reconnecting in ${delay / 1000}s...`);

        reconnectTimer = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      // Mark the connection as intentionally closed first.
      disposed = true;

      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }

      if (currentSocket) {
        currentSocket.onclose = null;
        currentSocket.onerror = null;
        currentSocket.close();
      }

      if (wsRef.current === currentSocket) {
        wsRef.current = null;
      }

      setIsConnected(false);
    };
  }, [roomId, username, hostToken, enabled, wsUrl]);

  return {
    send,
    isConnected,
    disconnect: () => {
      const ws = wsRef.current;
      if (ws) ws.close();
    },
  };
}
