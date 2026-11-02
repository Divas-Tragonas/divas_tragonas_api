import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { buildApp } from '../src/server';
import type { FastifyInstance } from 'fastify';

// The XP endpoints are a single aggregation-pipeline update (clamp at 0, capped
// log, awardId idempotency): the mocked route tests in characters.test.ts can't
// see any of that. Runs against a real MongoDB like sessions.integration.test.ts
// and skips itself when none is reachable.
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

describe.skipIf(!mongoAvailable)('/characters (real MongoDB)', () => {
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
    await mongoose.connection.db!.collection('characters').deleteMany({});
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  const create = async (payload: Record<string, unknown>) => {
    const res = await app.inject({ method: 'POST', url: '/characters', headers: auth(), payload });
    expect(res.statusCode).toBe(201);
    return res.json();
  };

  const award = (id: string, payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: `/characters/${id}/xp`, headers: auth(), payload });

  it('creates with the defaults, an empty sheet and no xp', async () => {
    const c = await create({ name: 'Liriandor Líadon' });
    expect(c).toMatchObject({
      name: 'Liriandor Líadon',
      player: '',
      level: 1,
      xp: 0,
      hpMax: 1,
      ac: 10,
      speed: 30,
      passivePerception: 10,
      portrait: '',
      notionUrl: '',
      sheet: {},
      xpLog: [],
    });
    expect(c.id).toMatch(/^[0-9a-f]{24}$/);
    expect(c).not.toHaveProperty('_id');
    expect(c.createdAt).toBeDefined();

    const got = await app.inject({ method: 'GET', url: `/characters/${c.id}`, headers: auth() });
    expect(got.json().sheet).toEqual({});
  });

  it('round-trips the opaque sheet, empty nested objects included', async () => {
    const sheet = { abilities: { str: 8, int: 17 }, spells: [{ name: 'Grasa' }], equipment: {} };
    const c = await create({ name: 'A', sheet });
    const got = await app.inject({ method: 'GET', url: `/characters/${c.id}`, headers: auth() });
    expect(got.json().sheet).toEqual(sheet);
  });

  it('lists without xpLog, and PUT only touches the given fields', async () => {
    const c = await create({ name: 'A', className: 'Mago', level: 2 });
    await award(c.id, { amount: 300 });

    const put = await app.inject({
      method: 'PUT',
      url: `/characters/${c.id}`,
      headers: auth(),
      payload: { level: 3 },
    });
    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({ level: 3, className: 'Mago', xp: 300 });

    const list = await app.inject({ method: 'GET', url: '/characters', headers: auth() });
    expect(list.json()).toHaveLength(1);
    expect(list.json()[0]).toMatchObject({ id: c.id, xp: 300, level: 3 });
    expect(list.json()[0]).not.toHaveProperty('xpLog');
  });

  it('awards xp, logs it and never goes below 0', async () => {
    const c = await create({ name: 'A' });

    const up = await award(c.id, { amount: 200, reason: 'Goblins', source: 'combat' });
    expect(up.statusCode).toBe(200);
    expect(up.json().xp).toBe(200);
    expect(up.json().xpLog).toHaveLength(1);
    expect(up.json().xpLog[0]).toMatchObject({
      amount: 200,
      reason: 'Goblins',
      source: 'combat',
      awardId: '',
    });
    expect(new Date(up.json().xpLog[0].at).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const down = await award(c.id, { amount: -500 });
    expect(down.json().xp).toBe(0);
    // The log records what was actually applied, so it always adds up to xp.
    expect(down.json().xpLog[1].amount).toBe(-200);
  });

  it('does not apply the same awardId twice', async () => {
    const c = await create({ name: 'A' });
    const first = await award(c.id, { amount: 100, awardId: 'combat-1' });
    const retry = await award(c.id, { amount: 100, awardId: 'combat-1' });
    expect(first.json().xp).toBe(100);
    expect(retry.statusCode).toBe(200);
    expect(retry.json().xp).toBe(100);
    expect(retry.json().xpLog).toHaveLength(1);

    const other = await award(c.id, { amount: 50, awardId: 'combat-2' });
    expect(other.json().xp).toBe(150);
  });

  it('stores text that looks like an operator as plain text', async () => {
    const c = await create({ name: 'A' });
    const res = await award(c.id, { amount: 10, reason: '$xp', source: '$$NOW' });
    expect(res.json().xpLog[0]).toMatchObject({ reason: '$xp', source: '$$NOW' });
  });

  it('keeps only the newest 200 log entries', async () => {
    const c = await create({ name: 'A' });
    const log = Array.from({ length: 200 }, (_, i) => ({
      amount: 1,
      reason: `old ${i}`,
      source: '',
      awardId: '',
      at: new Date(),
    }));
    await mongoose.connection
      .db!.collection('characters')
      .updateOne({ _id: new mongoose.Types.ObjectId(c.id) }, { $set: { xpLog: log, xp: 200 } });

    const res = await award(c.id, { amount: 5, reason: 'new' });
    expect(res.json().xp).toBe(205);
    expect(res.json().xpLog).toHaveLength(200);
    expect(res.json().xpLog[0].reason).toBe('old 1');
    expect(res.json().xpLog[199].reason).toBe('new');
  });

  it('loses no award under concurrency', async () => {
    const c = await create({ name: 'A' });
    await Promise.all(Array.from({ length: 20 }, () => award(c.id, { amount: 10 })));
    const got = await app.inject({ method: 'GET', url: `/characters/${c.id}`, headers: auth() });
    expect(got.json().xp).toBe(200);
    expect(got.json().xpLog).toHaveLength(20);
  });

  it('returns 404 for an unknown or malformed id', async () => {
    expect((await award('000000000000000000000000', { amount: 5 })).statusCode).toBe(404);
    expect((await award('not-an-id', { amount: 5 })).statusCode).toBe(404);
  });

  it('batch: awards everyone, in request order, idempotently', async () => {
    const a = await create({ name: 'A' });
    const b = await create({ name: 'B' });
    const body = {
      awards: [
        { id: b.id, amount: 30 },
        { id: a.id, amount: 70 },
      ],
      reason: 'Combat',
      source: 'combat',
      awardId: 'combat-7',
    };

    const res = await app.inject({
      method: 'POST',
      url: '/characters/xp',
      headers: auth(),
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((c: { id: string; xp: number }) => [c.id, c.xp])).toEqual([
      [b.id, 30],
      [a.id, 70],
    ]);
    expect(res.json()[0].xpLog[0]).toMatchObject({ awardId: 'combat-7', reason: 'Combat' });

    const retry = await app.inject({
      method: 'POST',
      url: '/characters/xp',
      headers: auth(),
      payload: body,
    });
    expect(retry.json().map((c: { xp: number }) => c.xp)).toEqual([30, 70]);
  });

  it('batch: an unknown id applies nothing', async () => {
    const a = await create({ name: 'A' });
    const res = await app.inject({
      method: 'POST',
      url: '/characters/xp',
      headers: auth(),
      payload: {
        awards: [
          { id: a.id, amount: 50 },
          { id: '000000000000000000000000', amount: 50 },
        ],
      },
    });
    expect(res.statusCode).toBe(404);
    const got = await app.inject({ method: 'GET', url: `/characters/${a.id}`, headers: auth() });
    expect(got.json().xp).toBe(0);
  });

  it('DELETE removes the character', async () => {
    const c = await create({ name: 'A' });
    const del = await app.inject({ method: 'DELETE', url: `/characters/${c.id}`, headers: auth() });
    expect(del.statusCode).toBe(204);
    const got = await app.inject({ method: 'GET', url: `/characters/${c.id}`, headers: auth() });
    expect(got.statusCode).toBe(404);
  });
});
