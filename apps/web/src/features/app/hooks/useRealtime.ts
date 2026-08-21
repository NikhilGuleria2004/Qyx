import { useEffect, useRef, useCallback } from 'react';
import { getAccessToken } from '../../../lib/auth';
import { wsUrl } from '../../../lib/config';

type ServerFrame =
  | { type: 'message'; conversation_id: string; message: Record<string, unknown> }
  | { type: 'presence'; user_id: string; status: 'online' | 'offline' }
  | { type: 'membership_changed'; conversation_id: string; event: string }
  | { type: 'revoked'; reason: string; conversation_id: string }
  | { type: 'typing'; conversation_id: string; user_id: string };

type MessageHandler = (frame: ServerFrame) => void;

export function useRealtime(onMessage: MessageHandler) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token || typeof WebSocket === 'undefined') return;

    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrlValue = wsUrl('/v1/realtime?access_token=' + encodeURIComponent(token));

    try {
      const ws = new WebSocket(wsUrlValue);
      wsRef.current = ws;

      ws.addEventListener('open', () => {
        if (subscribedRef.current.size > 0) {
          ws.send(JSON.stringify({ type: 'subscribe', conversation_ids: Array.from(subscribedRef.current) }));
        }
      });

      ws.addEventListener('message', (event) => {
        try {
          const frame = JSON.parse(event.data) as ServerFrame;
          if (frame.type === 'message') {
            onMessageRef.current(frame);
          }
        } catch {
          // ignore invalid frames
        }
      });

      ws.addEventListener('close', () => {
        wsRef.current = null;
        reconnectTimerRef.current = window.setTimeout(() => connect(), 2000);
      });

      ws.addEventListener('error', () => {
        ws.close();
      });
    } catch {
      // WebSocket not supported or connection failed
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [connect]);

  const subscribe = useCallback((conversationId: string) => {
    subscribedRef.current.add(conversationId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'subscribe', conversation_ids: [conversationId] }));
    }
  }, []);

  const unsubscribe = useCallback((conversationId: string) => {
    subscribedRef.current.delete(conversationId);
  }, []);

  const sendTyping = useCallback((conversationId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'typing', conversation_id: conversationId }));
    }
  }, []);

  return { subscribe, unsubscribe, sendTyping };
}
