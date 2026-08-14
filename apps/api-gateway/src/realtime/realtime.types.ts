type ClientFrame =
  | { type: 'subscribe'; conversation_ids: string[] }
  | { type: 'ack'; message_id: string }
  | { type: 'typing'; conversation_id: string };

type ServerFrame =
  | { type: 'message'; conversation_id: string; message: Record<string, unknown> }
  | { type: 'presence'; user_id: string; status: 'online' | 'offline' }
  | { type: 'membership_changed'; conversation_id: string; event: string }
  | { type: 'revoked'; reason: string; conversation_id: string }
  | { type: 'typing'; conversation_id: string; user_id: string };

export type { ClientFrame, ServerFrame };
