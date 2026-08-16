import { Queue } from '@cloudflare/workers-types';

type Env = {
  OFFLINE_DELIVERY_QUEUE: Queue;
};

export class ChannelDO {
  private sockets: Set<WebSocket> = new Set();
  private sequence: number = 0;

  constructor(private _state: DurableObjectState, private _env: Env) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/ws') {
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

      return new Response(null, { status: 101, webSocket: client });
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const body = (await request.json()) as { event: string; messageId?: string; ciphertext?: string; message_type?: string; sender_id?: string; conversation_id?: string; recipient_id?: string };
      
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
      }

      return new Response(JSON.stringify({ ok: true, sequence: this.sequence }), {
        headers: { 'content-type': 'application/json' },
      });
    }

    return new Response('ChannelDO', { headers: { 'content-type': 'text/plain' } });
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
}
