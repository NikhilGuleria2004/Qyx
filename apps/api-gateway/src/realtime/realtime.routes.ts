import { Hono } from 'hono';
import { addConnection, removeConnection, handleFrame, broadcastPresence } from './realtime';

type RealtimeBindings = {
  SESSION_KV: KVNamespace;
};

type RealtimeVariables = {
  requestId?: string;
};

const app = new Hono<{ Bindings: RealtimeBindings; Variables: RealtimeVariables }>();

app.get('/v1/realtime', async (c) => {
  const url = new URL(c.req.url);
  const accessToken = url.searchParams.get('access_token');

  if (!accessToken) {
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Missing access_token', request_id: c.get('requestId') as string } }, 401);
  }

  let session: { user_id: string; organization_id: string; role: string; device_id?: string };
  try {
    const sessionData = await c.env.SESSION_KV.get(accessToken, 'json');
    if (!sessionData) {
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid or expired session', request_id: c.get('requestId') as string } }, 401);
    }
    session = sessionData as typeof session;
  } catch {
    return c.json({ error: { code: 'UNAUTHENTICATED', message: 'Invalid session', request_id: c.get('requestId') as string } }, 401);
  }

  if (!c.req.header('upgrade')?.toLowerCase().includes('websocket')) {
    return c.json({ error: { code: 'UPGRADE_REQUIRED', message: 'WebSocket upgrade required', request_id: c.get('requestId') as string } }, 426);
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  const connection = {
    userId: session.user_id,
    organizationId: session.organization_id,
    ws: server,
    subscriptions: new Set<string>(),
  };

  addConnection(connection);
  broadcastPresence(session.user_id, 'online');

  server.addEventListener('message', (event) => {
    handleFrame(connection, event.data);
  });

  server.addEventListener('close', () => {
    removeConnection(connection);
    broadcastPresence(session.user_id, 'offline');
  });

  server.addEventListener('error', () => {
    removeConnection(connection);
    broadcastPresence(session.user_id, 'offline');
  });

  return new Response(null, { status: 101, webSocket: client });
});

export default app;
