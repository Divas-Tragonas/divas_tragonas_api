import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildApp } from '../src/server';
import { CharacterModel } from '../src/modules/characters/character.model';
// vi.mock is hoisted above the imports, so this is the mocked module.
import * as service from '../src/modules/characters/character.service';

vi.mock('../src/config/db', () => ({
  connectDb: vi.fn(),
  disconnectDb: vi.fn(),
  getDbStatus: vi.fn(() => 'connected'),
}));

const ID = '507f1f77bcf86cd799439011';
const ID2 = '507f1f77bcf86cd799439012';

const mockCharacter = {
  id: ID,
  name: 'Liriandor Líadon',
  player: 'Carlos',
  race: 'Elf',
  className: 'Mago',
  level: 3,
  xp: 900,
  hpMax: 18,
  ac: 12,
  speed: 30,
  passivePerception: 13,
  portrait: '',
  notionUrl: '',
  sheet: { str: 8, int: 17 },
  xpLog: [],
  createdAt: '2026-11-01T10:00:00.000Z',
  updatedAt: '2026-11-01T10:00:00.000Z',
};

vi.mock('../src/modules/characters/character.service', () => ({
  getAllCharacters: vi.fn(async () => {
    const summary: Partial<typeof mockCharacter> = { ...mockCharacter };
    delete summary.xpLog;
    return [summary];
  }),
  getCharacterById: vi.fn(async () => mockCharacter),
  createCharacter: vi.fn(async (data) => ({ ...mockCharacter, ...data, xp: 0, xpLog: [] })),
  updateCharacter: vi.fn(async (_id, data) => ({ ...mockCharacter, ...data })),
  deleteCharacter: vi.fn(async () => true),
  awardXp: vi.fn(async (_id, input) => ({ ...mockCharacter, xp: mockCharacter.xp + input.amount })),
  awardXpBatch: vi.fn(async (input) => ({
    ok: true,
    characters: input.awards.map((a: { id: string; amount: number }) => ({
      ...mockCharacter,
      id: a.id,
      xp: mockCharacter.xp + a.amount,
    })),
  })),
}));

describe('/characters', () => {
  const app = buildApp();
  let token: string;

  beforeAll(async () => {
    await app.ready();
    token = app.jwt.sign({ role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it.each([
    ['GET', '/characters'],
    ['GET', `/characters/${ID}`],
    ['POST', '/characters'],
    ['PUT', `/characters/${ID}`],
    ['DELETE', `/characters/${ID}`],
    ['POST', `/characters/${ID}/xp`],
    ['POST', '/characters/xp'],
  ] as const)('%s %s returns 401 without token', async (method, url) => {
    const res = await app.inject({ method, url, payload: method === 'GET' ? undefined : {} });
    expect(res.statusCode).toBe(401);
  });

  it('GET /characters returns the list without xpLog', async () => {
    const res = await app.inject({ method: 'GET', url: '/characters', headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toHaveLength(1);
    expect(res.json()[0]).not.toHaveProperty('xpLog');
  });

  it('GET /characters/:id returns the character with xpLog', async () => {
    const res = await app.inject({ method: 'GET', url: `/characters/${ID}`, headers: auth() });
    expect(res.statusCode).toBe(200);
    expect(res.json().xpLog).toEqual([]);
  });

  it('GET /characters/:id returns 404 when not found', async () => {
    vi.mocked(service.getCharacterById).mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'GET', url: `/characters/${ID}`, headers: auth() });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });

  it('POST /characters applies the defaults', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: auth(),
      payload: { name: '  Yunquerin  ' },
    });
    expect(res.statusCode).toBe(201);
    expect(vi.mocked(service.createCharacter)).toHaveBeenLastCalledWith({
      name: 'Yunquerin',
      player: '',
      race: '',
      className: '',
      level: 1,
      hpMax: 1,
      ac: 10,
      speed: 30,
      passivePerception: 10,
      portrait: '',
      notionUrl: '',
      sheet: {},
    });
  });

  it('POST /characters keeps the opaque sheet as-is and strips unknown keys', async () => {
    const sheet = { abilities: { str: 8 }, spells: [{ name: 'Grasa', level: 1 }], notes: '' };
    const res = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: auth(),
      payload: { name: 'Liriandor', sheet, id: 'nope', createdAt: 'x' },
    });
    expect(res.statusCode).toBe(201);
    const data = vi.mocked(service.createCharacter).mock.lastCall?.[0];
    expect(data?.sheet).toEqual(sheet);
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('createdAt');
  });

  it.each([
    [{ name: '' }],
    [{ name: 'x'.repeat(81) }],
    [{ name: 'A', player: 'x'.repeat(61) }],
    [{ name: 'A', level: 0 }],
    [{ name: 'A', level: 21 }],
    [{ name: 'A', level: 2.5 }],
    [{ name: 'A', hpMax: 0 }],
    [{ name: 'A', ac: -1 }],
    [{ name: 'A', speed: -5 }],
    [{ name: 'A', passivePerception: -1 }],
    [{ name: 'A', sheet: [] }],
    [{ name: 'A', sheet: 'text' }],
    [{ name: 'A', sheet: { blob: 'x'.repeat(512 * 1024) } }],
  ])('POST /characters returns 400 for %j', async (payload) => {
    const res = await app.inject({ method: 'POST', url: '/characters', headers: auth(), payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
    expect(service.createCharacter).not.toHaveBeenCalled();
  });

  it.each([[{ xp: 100 }], [{ xpLog: [] }]])('POST and PUT /characters reject %j', async (extra) => {
    const post = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: auth(),
      payload: { name: 'A', ...extra },
    });
    expect(post.statusCode).toBe(400);
    expect(post.json().error).toMatch(/xp/);

    const put = await app.inject({
      method: 'PUT',
      url: `/characters/${ID}`,
      headers: auth(),
      payload: { name: 'A', ...extra },
    });
    expect(put.statusCode).toBe(400);
    expect(service.createCharacter).not.toHaveBeenCalled();
    expect(service.updateCharacter).not.toHaveBeenCalled();
  });

  it('PUT /characters/:id sends only the fields in the body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/characters/${ID}`,
      headers: auth(),
      payload: { level: 4 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().level).toBe(4);
    expect(vi.mocked(service.updateCharacter)).toHaveBeenLastCalledWith(ID, { level: 4 });
  });

  it('PUT /characters/:id returns 400 for an empty body', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/characters/${ID}`,
      headers: auth(),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /characters/:id returns 404 when not found', async () => {
    vi.mocked(service.updateCharacter).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'PUT',
      url: `/characters/${ID}`,
      headers: auth(),
      payload: { level: 2 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /characters/:id returns 204, or 404 when not found', async () => {
    const ok = await app.inject({ method: 'DELETE', url: `/characters/${ID}`, headers: auth() });
    expect(ok.statusCode).toBe(204);

    vi.mocked(service.deleteCharacter).mockResolvedValueOnce(false);
    const missing = await app.inject({
      method: 'DELETE',
      url: `/characters/${ID}`,
      headers: auth(),
    });
    expect(missing.statusCode).toBe(404);
  });

  it('POST /characters/:id/xp awards xp with the defaults for the metadata', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/characters/${ID}/xp`,
      headers: auth(),
      payload: { amount: 50 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().xp).toBe(950);
    expect(vi.mocked(service.awardXp)).toHaveBeenLastCalledWith(ID, {
      amount: 50,
      reason: '',
      source: '',
      awardId: '',
    });
  });

  it.each([
    [{}],
    [{ amount: 0 }],
    [{ amount: 1.5 }],
    [{ amount: 100001 }],
    [{ amount: -100001 }],
    [{ amount: 10, reason: 'x'.repeat(121) }],
    [{ amount: 10, source: 'x'.repeat(61) }],
    [{ amount: 10, awardId: 'x'.repeat(65) }],
  ])('POST /characters/:id/xp returns 400 for %j', async (payload) => {
    const res = await app.inject({
      method: 'POST',
      url: `/characters/${ID}/xp`,
      headers: auth(),
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(service.awardXp).not.toHaveBeenCalled();
  });

  it('POST /characters/:id/xp accepts the limits and negative amounts', async () => {
    for (const amount of [100000, -100000, -5]) {
      const res = await app.inject({
        method: 'POST',
        url: `/characters/${ID}/xp`,
        headers: auth(),
        payload: { amount },
      });
      expect(res.statusCode).toBe(200);
    }
  });

  it('POST /characters/:id/xp returns 404 when not found', async () => {
    vi.mocked(service.awardXp).mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'POST',
      url: `/characters/${ID}/xp`,
      headers: auth(),
      payload: { amount: 10 },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /characters/xp is the batch route, not /characters/:id', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/characters/xp',
      headers: auth(),
      payload: {
        awards: [
          { id: ID, amount: 25 },
          { id: ID2, amount: 25 },
        ],
        reason: 'Combat a la cripta',
        source: 'combat',
        awardId: 'combat-1',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().map((c: { id: string }) => c.id)).toEqual([ID, ID2]);
    expect(service.awardXp).not.toHaveBeenCalled();
    expect(vi.mocked(service.awardXpBatch)).toHaveBeenLastCalledWith({
      awards: [
        { id: ID, amount: 25 },
        { id: ID2, amount: 25 },
      ],
      reason: 'Combat a la cripta',
      source: 'combat',
      awardId: 'combat-1',
    });
  });

  it.each([
    [{}],
    [{ awards: [] }],
    [{ awards: Array.from({ length: 21 }, (_, i) => ({ id: `id${i}`, amount: 1 })) }],
    [{ awards: [{ id: ID, amount: 0 }] }],
    [{ awards: [{ id: '', amount: 5 }] }],
    [
      {
        awards: [
          { id: ID, amount: 5 },
          { id: ID, amount: 5 },
        ],
      },
    ],
  ])('POST /characters/xp returns 400 for %j', async (payload) => {
    const res = await app.inject({
      method: 'POST',
      url: '/characters/xp',
      headers: auth(),
      payload,
    });
    expect(res.statusCode).toBe(400);
    expect(service.awardXpBatch).not.toHaveBeenCalled();
  });

  it('POST /characters/xp returns 404 naming the unknown id', async () => {
    vi.mocked(service.awardXpBatch).mockResolvedValueOnce({ ok: false, missing: ID2 });
    const res = await app.inject({
      method: 'POST',
      url: '/characters/xp',
      headers: auth(),
      payload: { awards: [{ id: ID2, amount: 5 }] },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toContain(ID2);
  });

  it('accepts a body above the default 1MB limit (portrait + sheet)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/characters',
      headers: auth(),
      payload: {
        name: 'A',
        portrait: 'data:image/png;base64,' + 'A'.repeat(900 * 1024),
        sheet: { notes: 'x'.repeat(400 * 1024) },
      },
    });
    expect(res.statusCode).toBe(201);
  });
});

describe('CharacterModel', () => {
  it('serializes with id, the defaults and an empty sheet', () => {
    const doc = CharacterModel.hydrate({ _id: ID, name: 'Liriandor' });
    const json = doc.toJSON() as Record<string, unknown>;
    expect(json).toMatchObject({
      id: ID,
      name: 'Liriandor',
      level: 1,
      xp: 0,
      hpMax: 1,
      ac: 10,
      speed: 30,
      passivePerception: 10,
      sheet: {},
      xpLog: [],
    });
    expect(json).not.toHaveProperty('_id');
  });
});
