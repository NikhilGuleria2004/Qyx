import { ClientFrame, ServerFrame } from './realtime.types';

export type Connection = {
  userId: string;
  organizationId: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  db: D1Database;
};

const connections: Connection[] = [];

export function addConnection(connection: Connection) {
  connections.push(connection);
}

export function removeConnection(connection: Connection) {
  const index = connections.indexOf(connection);
  if (index !== -1) {
    connections.splice(index, 1);
  }
}

export function getSubscribers(conversationId: string): WebSocket[] {
  return connections
    .filter(c => c.subscriptions.has(conversationId))
    .map(c => c.ws);
}

export function broadcast(conversationId: string, frame: ServerFrame) {
  const subscribers = getSubscribers(conversationId);
  const message = JSON.stringify(frame);
  for (const ws of subscribers) {
    try {
      ws.send(message);
    } catch {
      // dead socket; cleanup happens on close
    }
  }
}

export function broadcastPresence(userId: string, status: 'online' | 'offline') {
  const frame: ServerFrame = { type: 'presence', user_id: userId, status };
  const message = JSON.stringify(frame);
  for (const conn of connections) {
    try {
      conn.ws.send(message);
    } catch {
      // ignore
    }
  }
}

export async function handleFrame(connection: Connection, data: string | ArrayBuffer): Promise<void> {
  let frame: ClientFrame;
  try {
    frame = JSON.parse(typeof data === 'string' ? data : new TextDecoder().decode(data)) as ClientFrame;
  } catch {
    connection.ws.send(JSON.stringify({ type: 'error', message: 'invalid frame' }));
    return;
  }

  switch (frame.type) {
    case 'subscribe':
      for (const conversationId of frame.conversation_ids) {
        const isMember = connection.subscriptions.has(conversationId) || (await verifyMembership(connection.db, conversationId, connection.userId));
        if (isMember) {
          connection.subscriptions.add(conversationId);
        }
      }
      connection.ws.send(JSON.stringify({ type: 'subscribed', conversation_ids: Array.from(connection.subscriptions) }));
      break;

    case 'ack':
      connection.ws.send(JSON.stringify({ type: 'ack', message_id: frame.message_id }));
      break;

    case 'typing':
      broadcast(frame.conversation_id, { type: 'typing', conversation_id: frame.conversation_id, user_id: connection.userId });
      break;

    default:
      connection.ws.send(JSON.stringify({ type: 'error', message: `unknown frame type: ${(frame as ClientFrame).type}` }));
  }
}

async function verifyMembership(db: D1Database, conversationId: string, userId: string): Promise<boolean> {
  const member = await db.prepare(
    'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND removed_at IS NULL'
  ).bind(conversationId, userId).first();
  return member !== null;
}
