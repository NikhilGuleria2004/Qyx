import { describe, it, expect } from 'vitest';

describe('searchIndex', () => {
  it('indexes and searches messages', async () => {
    const { getSearchIndex } = await import('./searchIndex');
    const index = await getSearchIndex();
    await index.clear();

    await index.add({
      id: 'msg_1',
      text: 'Deploy completed, all green.',
      timestamp: 1000,
      conversationId: 'conv_1',
      senderId: 'alice.k',
    });
    await index.add({
      id: 'msg_2',
      text: 'nice, watching metrics now',
      timestamp: 2000,
      conversationId: 'conv_1',
      senderId: 'bob.r',
    });

    const results = await index.search('deploy');
    expect(results.map(r => r.id)).toEqual(['msg_1']);
  });

  it('returns empty array for no matches', async () => {
    const { getSearchIndex } = await import('./searchIndex');
    const index = await getSearchIndex();
    await index.clear();

    await index.add({
      id: 'msg_1',
      text: 'hello world',
      timestamp: 1000,
      conversationId: 'conv_1',
      senderId: 'alice.k',
    });

    const results = await index.search('zzz');
    expect(results).toEqual([]);
  });

  it('is case-insensitive', async () => {
    const { getSearchIndex } = await import('./searchIndex');
    const index = await getSearchIndex();
    await index.clear();

    await index.add({
      id: 'msg_1',
      text: 'Hello World',
      timestamp: 1000,
      conversationId: 'conv_1',
      senderId: 'alice.k',
    });

    const results = await index.search('HELLO');
    expect(results.map(r => r.id)).toEqual(['msg_1']);
  });

  it('clear removes all records', async () => {
    const { getSearchIndex } = await import('./searchIndex');
    const index = await getSearchIndex();
    await index.clear();

    await index.add({
      id: 'msg_1',
      text: 'test',
      timestamp: 1000,
      conversationId: 'conv_1',
      senderId: 'alice.k',
    });

    await index.clear();
    const results = await index.search('test');
    expect(results).toEqual([]);
  });

  it('rebuilds correctly on fresh device', async () => {
    const { getSearchIndex } = await import('./searchIndex');
    const index = await getSearchIndex();
    await index.clear();

    await index.add({
      id: 'msg_1',
      text: 'fresh device message',
      timestamp: 1000,
      conversationId: 'conv_1',
      senderId: 'alice.k',
    });

    const results = await index.search('fresh');
    expect(results.map(r => r.id)).toEqual(['msg_1']);
  });
});
