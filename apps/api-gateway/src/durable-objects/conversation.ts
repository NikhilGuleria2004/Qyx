import { Queue } from '@cloudflare/workers-types';
import { MetricsService } from '../services/metrics/metrics.service';

type Env = {
  OFFLINE_DELIVERY_QUEUE: Queue;
  PRIMARY_DB: D1Database;
};

export class ConversationDO {
  private sockets: Set<WebSocket> = new Set();
  private sequence: number = 0;
  private removedMembers: Set<string> = new Set();

  constructor(private _state: DurableObjectState, private _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
      const userId = url.searchParams.get('user_id');
      if (!userId) {
        return new Response('user_id required', { status: 401 });
      }

      if (this.removedMembers.has(userId)) {
        return new Response('Forbidden', { status: 403 });
      }

      const isMember = await this.verifyMembership(userId);
      if (!isMember) {
        return new Response('Forbidden: not a conversation member', { status: 403 });
      }

      const webSocketPair = new WebSocketPair();
      const [client, server] = Object.values(webSocketPair);

      this._state.acceptWebSocket(server);
      this.sockets.add(server);

      server.addEventListener('message', (event) => {
        this.handleMessage(server, event.data);
      });

      server.addEventListener('close', () => {
        this.sockets.delete(server);
      });

      const doName = this._state.id.toString();
      const metricsService = new MetricsService(this._env.PRIMARY_DB);
      metricsService.recordEvent({
        service: 'messaging',
        operation: 'do_connection',
        status: 'success',
        latency_ms: 0,
        metadata: { do_name: doName, user_id: userId || '' },
      }).catch(() => {});

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = (await request.json()) as { event: string; messageId?: string; ciphertext?: string; message_type?: string; sender_id?: string; conversation_id?: string; recipient_id?: string; removed_user_id?: string };

      if (body.event === 'new_message') {
        this.sequence++;
        const sequenceNumber = this.sequence;

        const frame = {
          type: 'message',
          sequence: sequenceNumber,
          message_id: body.messageId,
          ciphertext: body.ciphertext,
          message_type: body.message_type,
          sender_id: body.sender_id,
        };

        if (this.sockets.size === 0) {
          await this._env.OFFLINE_DELIVERY_QUEUE.send({
            conversation_id: body.conversation_id,
            message_id: body.messageId,
            recipient_id: body.recipient_id,
            sender_id: body.sender_id,
            message_type: body.message_type,
          });
        } else {
          this.broadcast(JSON.stringify(frame));
        }

        const metricsService = new MetricsService(this._env.PRIMARY_DB);
        metricsService.recordEvent({
          service: 'messaging',
          operation: 'do_fan_out',
          status: 'success',
          latency_ms: 0,
          metadata: { do_name: this._state.id.toString(), message_id: body.messageId || '', recipient_count: this.sockets.size },
        }).catch(() => {});
      }

      if (body.event === 'member_removed' && body.removed_user_id) {
        this.removedMembers.add(body.removed_user_id);
      }

      return new Response(JSON.stringify({ ok: true, sequence: this.sequence }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('ConversationDO', { headers: { 'content-type': 'text/plain' } });
  }

  private handleMessage(_ws: WebSocket, _data: string | ArrayBuffer): void {
    // Client-to-server messages handled here if needed
  }

  private broadcast(message: string): void {
    for (const ws of this.sockets) {
      try {
        ws.send(message);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    this.handleMessage(ws, message);
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.sockets.delete(ws);
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.sockets.delete(ws);
  }

  private async verifyMembership(userId: string): Promise<boolean> {
    const conversationId = this._state.id.toString();
    const member = await this._env.PRIMARY_DB.prepare(
      'SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ? AND removed_at IS NULL'
    ).bind(conversationId, userId).first();
    return member !== null;
  }
}
