import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { buildApp } from '../src/server';
import type { FastifyInstance } from 'fastify';

// These tests run against a REAL MongoDB, because the interesting part of the
// sessions module — storing the opaque `data` blob in GridFS so it can exceed
// Mongo's 16MB BSON document limit — is invisible to the mocked route tests in
// sessions.test.ts. CI starts a mongo service for this; when no server is
// reachable (a dev machine without Mongo) the whole suite skips instead of
// failing, so `pnpm test` stays runnable offline.
const MONGO_URL = process.env.MONGO_INTEGRATION_URL ?? 'mongodb://127.0.0.1:27017/dt_integration';

const mongoAvailable = await (async () => {
  try {
    await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 2000 });
    await mongoose.disconnect();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!mongoAvailable)('/sessions (real MongoDB + GridFS)', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    await mongoose.connect(MONGO_URL, { serverSelectionTimeoutMS: 2000 });
    app = buildApp();
    await app.ready();
    token = app.jwt.sign({ role: 'admin' });
  });

  afterAll(async () => {
    await app?.close();
    await mongoose.disconnect();
  });

  beforeEach(async () => {
    const db = mongoose.connection.db!;
    // Only drop what this module owns, never the whole database.
    for (const name of ['sessions', 'session_data.files', 'session_data.chunks']) {
      await db.collection(name).deleteMany({});
    }
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const create = (name: string, data: unknown) =>
    app.inject({ method: 'POST', url: '/sessions', headers: auth(), payload: { name, data } });

  const gridFsFileCount = () =>
    mongoose.connection.db!.collection('session_data.files').countDocuments();

  it('round-trips an opaque data blob through GridFS', async () => {
    const data = { enemies: [{ id: 1, hp: 10 }], map: { bg: 'taverna' }, deep: { a: [1, { b: 2 }] } };

    const created = await create('Partida', data);
    expect(created.statusCode).toBe(201);
    expect(created.json().id).toBeTruthy();
    expect(created.json().sizeBytes).toBe(Buffer.byteLength(JSON.stringify(data)));

    const fetched = await app.inject({
      method: 'GET',
      url: `/sessions/${created.json().id}`,
      headers: auth(),
    });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json().data).toEqual(data);
  });

  it(
    'stores and returns a blob larger than Mongo\'s 16MB document limit',
    async () => {
      // 18MB of payload would make an inline document unstorable; GridFS is the
      // reason this works at all, so this is the regression guard for it.
      const data = { video: 'A'.repeat(18 * 1024 * 1024), label: 'over-16mb' };

      const created = await create('Partida gran', data);
      expect(created.statusCode).toBe(201);

      const fetched = await app.inject({
        method: 'GET',
        url: `/sessions/${created.json().id}`,
        headers: auth(),
      });
      expect(fetched.statusCode).toBe(200);
      expect(fetched.json().data.video.length).toBe(18 * 1024 * 1024);
      expect(fetched.json().data.label).toBe('over-16mb');
    },
    { timeout: 180_000 },
  );

  it('lists sessions without the data blob and without the internal file pointer', async () => {
    await create('Una', { foo: 'bar' });

    const res = await app.inject({ method: 'GET', url: '/sessions', headers: auth() });
    expect(res.statusCode).toBe(200);

    const [row] = res.json();
    expect(row.data).toBeUndefined();
    expect(row.dataFileId).toBeUndefined();
    expect(row.id).toBeTruthy();
    expect(row.name).toBe('Una');
    expect(row.createdAt).toBeTruthy();
    expect(row.updatedAt).toBeTruthy();
    expect(row.sizeBytes).toBe(Buffer.byteLength(JSON.stringify({ foo: 'bar' })));
  });

  it('overwrites data on PUT and leaves no orphaned GridFS blob', async () => {
    const created = await create('Original', { v: 1 });
    expect(await gridFsFileCount()).toBe(1);

    const res = await app.inject({
      method: 'PUT',
      url: `/sessions/${created.json().id}`,
      headers: auth(),
      payload: { name: 'Renomenada', data: { v: 2 } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Renomenada');
    expect(res.json().data).toEqual({ v: 2 });
    expect(await gridFsFileCount()).toBe(1);
  });

  it('preserves the stored data when PUT only changes the name', async () => {
    const created = await create('Original', { keep: 'me' });

    const res = await app.inject({
      method: 'PUT',
      url: `/sessions/${created.json().id}`,
      headers: auth(),
      payload: { name: 'Nou nom' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Nou nom');
    expect(res.json().data).toEqual({ keep: 'me' });
  });

  it('deletes the session and its GridFS blob', async () => {
    const created = await create('Esborrable', { foo: 'bar' });
    const id = created.json().id;

    const del = await app.inject({ method: 'DELETE', url: `/sessions/${id}`, headers: auth() });
    expect(del.statusCode).toBe(204);

    const after = await app.inject({ method: 'GET', url: `/sessions/${id}`, headers: auth() });
    expect(after.statusCode).toBe(404);
    expect(await gridFsFileCount()).toBe(0);
  });

  it('returns 404 rather than 500 for a malformed id', async () => {
    const res = await app.inject({ method: 'GET', url: '/sessions/not-an-objectid', headers: auth() });
    expect(res.statusCode).toBe(404);
  });
});
