import { describe, it, expect } from 'vitest';
import { MessageService } from '../services/messages/message.service';

describe('P44 — Performance: message-send/fan-out load (service layer)', () => {
  it('sends 200 messages sequentially within p95 < 500ms', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({
            id: 'msg_1',
            organization_id: 'org_perf',
            conversation_id: 'conv_perf',
            sender_id: 'usr_perf',
            ciphertext: new Uint8Array([0x01]),
            message_type: 'text',
            attachment_ref: null,
            reply_to: null,
            created_at: Date.now(),
          }),
          all: async () => ({ results: [{ user_id: 'usr_perf' }] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new MessageService(db);
    const iterations = 200;
    const starts = new Array(iterations).fill(0);
    const ends = new Array(iterations).fill(0);

    for (let i = 0; i < iterations; i++) {
      starts[i] = performance.now();
      const result = await service.sendMessage('conv_perf', 'usr_perf', 'org_perf', {
        ciphertext: new Uint8Array([0x01]),
        message_type: 'text',
      });
      ends[i] = performance.now();
      expect(result.id).toBeDefined();
    }

    const latencies = ends.map((end, i) => end - starts[i]);
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(0.95 * latencies.length);
    const p95 = latencies[p95Index] || 0;

    expect(p95).toBeLessThan(500);
  });

  it('sends 50 concurrent messages within p95 < 500ms', async () => {
    const db = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({
          first: async () => ({
            id: 'msg_1',
            organization_id: 'org_perf',
            conversation_id: 'conv_perf',
            sender_id: 'usr_perf',
            ciphertext: new Uint8Array([0x01]),
            message_type: 'text',
            attachment_ref: null,
            reply_to: null,
            created_at: Date.now(),
          }),
          all: async () => ({ results: [{ user_id: 'usr_perf' }] }),
          run: async () => ({ changes: 1 }),
        }),
      }),
    } as unknown as D1Database;

    const service = new MessageService(db);
    const concurrency = 50;
    const starts = new Array(concurrency).fill(0);
    const ends = new Array(concurrency).fill(0);

    const promises = Array.from({ length: concurrency }, async (_, i) => {
      starts[i] = performance.now();
      const result = await service.sendMessage('conv_perf', 'usr_perf', 'org_perf', {
        ciphertext: new Uint8Array([0x01]),
        message_type: 'text',
      });
      ends[i] = performance.now();
      return result;
    });

    const results = await Promise.all(promises);
    const latencies = results.map((_, i) => ends[i] - starts[i]);
    latencies.sort((a, b) => a - b);
    const p95Index = Math.floor(0.95 * latencies.length);
    const p95 = latencies[p95Index] || 0;

    expect(results.every(r => r.id !== undefined)).toBe(true);
    expect(p95).toBeLessThan(500);
  });
});
