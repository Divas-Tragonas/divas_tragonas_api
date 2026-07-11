import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import WebSocket from 'ws';
import { buildApp } from '../src/server';
import { env } from '../src/config/env';

vi.mock('../src/config/db', () => ({
  connectDb: vi.fn(),
  disconnectDb: vi.fn(),
  getDbStatus: vi.fn(() => 'connected'),
}));

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

function nextMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once('message', (data) => resolve(data.toString()));
  });
}

function closeCode(ws: WebSocket): Promise<number> {
  return new Promise((resolve) => {
    ws.once('close', (code) => resolve(code));
  });
}

describe('/sync', () => {
  const app = buildApp();
  let baseUrl: string;
  const sockets: WebSocket[] = [];

  async function open(query: string): Promise<WebSocket> {
    const ws = await connect(`${baseUrl}/sync${query}`);
    sockets.push(ws);
    return ws;
  }

  beforeAll(async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    if (typeof address === 'string' || address === null) throw new Error('no address');
    baseUrl = `ws://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    env.SYNC_KEY = undefined;
    sockets.forEach((ws) => ws.close());
    sockets.length = 0;
  });

  it('relays DM messages to clients when no SYNC_KEY is set', async () => {
    const client = await open('?role=client');
    const dm = await open('?role=dm');

    const received = nextMessage(client);
    dm.send(JSON.stringify({ type: 'STATE', payload: { hp: 42 } }));

    expect(JSON.parse(await received)).toEqual({ type: 'STATE', payload: { hp: 42 } });
  });

  it('relays DM TOKEN_RELAY messages to all connected clients', async () => {
    const client1 = await open('?role=client');
    const client2 = await open('?role=client');
    const dm = await open('?role=dm');

    const received1 = nextMessage(client1);
    const received2 = nextMessage(client2);
    const message = { type: 'TOKEN_RELAY', id: 'pl_1', x: 100, y: 200 };
    dm.send(JSON.stringify(message));

    expect(JSON.parse(await received1)).toEqual(message);
    expect(JSON.parse(await received2)).toEqual(message);
  });

  it('relays client messages to the DM when no SYNC_KEY is set', async () => {
    const dm = await open('?role=dm');
    const client = await open('?role=client');

    const received = nextMessage(dm);
    client.send(JSON.stringify({ type: 'TOKEN_MOVE', id: 'goblin' }));

    expect(JSON.parse(await received)).toEqual({ type: 'TOKEN_MOVE', id: 'goblin' });
  });

  it('closes with 4401 when SYNC_KEY is set and no key is provided', async () => {
    env.SYNC_KEY = 'test-sync-key';
    const ws = await open('?role=client');

    expect(await closeCode(ws)).toBe(4401);
  });

  it('closes with 4401 when SYNC_KEY is set and the key is wrong', async () => {
    env.SYNC_KEY = 'test-sync-key';
    const ws = await open('?role=client&key=wrong');

    expect(await closeCode(ws)).toBe(4401);
  });

  it('relays messages when the correct key is provided', async () => {
    env.SYNC_KEY = 'test-sync-key';
    const client = await open('?role=client&key=test-sync-key');
    const dm = await open('?role=dm&key=test-sync-key');

    const received = nextMessage(client);
    dm.send(JSON.stringify({ type: 'STRUCT', tokens: [] }));

    expect(JSON.parse(await received)).toEqual({ type: 'STRUCT', tokens: [] });
  });
});
