import { describe, it, expect } from 'vitest';
import { addConnection, removeConnection, getSubscribers, broadcast, broadcastPresence, handleFrame, Connection } from './realtime';

function createMockWs(): WebSocket & { sent: string[] } {
  const sent: string[] = [];
  return {
    send: (data: string | ArrayBuffer) => sent.push(typeof data === 'string' ? data : '[binary]'),
    close: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    readyState: 1,
    protocol: '',
    url: '',
    bufferedAmount: 0,
    binaryType: 'blob',
    extensions: '',
    onopen: null,
    onerror: null,
    onclose: null,
    onmessage: null,
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    sent,
  } as unknown as WebSocket & { sent: string[] };
}

describe('realtime', () => {
  it('adds and removes connections', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const conn1: Connection = { userId: 'usr_1', organizationId: 'org_1', ws: ws1, subscriptions: new Set<string>() };
    const conn2: Connection = { userId: 'usr_2', organizationId: 'org_1', ws: ws2, subscriptions: new Set<string>() };

    addConnection(conn1);
    addConnection(conn2);
    expect(getSubscribers('conv_1').length).toBe(0);

    conn1.subscriptions.add('conv_1');
    expect(getSubscribers('conv_1').length).toBe(1);

    removeConnection(conn1);
    expect(getSubscribers('conv_1').length).toBe(0);
  });

  it('broadcasts message frames to subscribers', () => {
    const ws1 = createMockWs();
    const conn1: Connection = { userId: 'usr_1', organizationId: 'org_1', ws: ws1, subscriptions: new Set(['conv_1']) };
    addConnection(conn1);

    broadcast('conv_1', { type: 'message', conversation_id: 'conv_1', message: { id: 'msg_1' } });
    expect(ws1.sent.length).toBe(1);
    expect(JSON.parse(ws1.sent[0]).type).toBe('message');

    removeConnection(conn1);
  });

  it('broadcasts presence to all connections', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const conn1: Connection = { userId: 'usr_1', organizationId: 'org_1', ws: ws1, subscriptions: new Set() };
    const conn2: Connection = { userId: 'usr_2', organizationId: 'org_1', ws: ws2, subscriptions: new Set() };
    addConnection(conn1);
    addConnection(conn2);

    broadcastPresence('usr_1', 'online');
    expect(ws1.sent.length).toBe(1);
    expect(ws2.sent.length).toBe(1);
    expect(JSON.parse(ws1.sent[0]).type).toBe('presence');

    removeConnection(conn1);
    removeConnection(conn2);
  });

  it('handles subscribe frame', () => {
    const ws = createMockWs();
    const conn: Connection = { userId: 'usr_1', organizationId: 'org_1', ws, subscriptions: new Set<string>() };
    addConnection(conn);

    handleFrame(conn, JSON.stringify({ type: 'subscribe', conversation_ids: ['conv_1', 'conv_2'] }));
    expect(conn.subscriptions.has('conv_1')).toBe(true);
    expect(conn.subscriptions.has('conv_2')).toBe(true);
    expect(JSON.parse(ws.sent[0]).type).toBe('subscribed');

    removeConnection(conn);
  });

  it('handles ack frame', () => {
    const ws = createMockWs();
    const conn: Connection = { userId: 'usr_1', organizationId: 'org_1', ws, subscriptions: new Set() };
    addConnection(conn);

    handleFrame(conn, JSON.stringify({ type: 'ack', message_id: 'msg_1' }));
    expect(JSON.parse(ws.sent[0])).toEqual({ type: 'ack', message_id: 'msg_1' });

    removeConnection(conn);
  });

  it('handles typing frame', () => {
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const conn1: Connection = { userId: 'usr_1', organizationId: 'org_1', ws: ws1, subscriptions: new Set(['conv_1']) };
    const conn2: Connection = { userId: 'usr_2', organizationId: 'org_1', ws: ws2, subscriptions: new Set(['conv_1']) };
    addConnection(conn1);
    addConnection(conn2);

    handleFrame(conn1, JSON.stringify({ type: 'typing', conversation_id: 'conv_1' }));
    expect(ws2.sent.length).toBe(1);
    expect(JSON.parse(ws2.sent[0]).type).toBe('typing');

    removeConnection(conn1);
    removeConnection(conn2);
  });

  it('rejects invalid frame', () => {
    const ws = createMockWs();
    const conn: Connection = { userId: 'usr_1', organizationId: 'org_1', ws, subscriptions: new Set() };
    addConnection(conn);

    handleFrame(conn, 'not json');
    expect(JSON.parse(ws.sent[0]).type).toBe('error');

    removeConnection(conn);
  });
});
