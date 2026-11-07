import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server';
import { EnemyModel } from '../src/modules/enemies/enemy.model';

vi.mock('../src/config/db', () => ({
  connectDb: vi.fn(),
  disconnectDb: vi.fn(),
  getDbStatus: vi.fn(() => 'connected'),
}));

const mockEnemy = {
  id: '507f1f77bcf86cd799439011',
  name: 'Goblin',
  color: '#3a8a3a',
  hpMax: 10,
  R: 20,
  sm: 1.0,
  project: 'La cripta',
  category: 'Morts vivents',
};

vi.mock('../src/modules/enemies/enemy.service', () => ({
  getAllEnemies: vi.fn(async () => [mockEnemy]),
  createEnemy: vi.fn(async (data) => ({ ...data, id: mockEnemy.id })),
  updateEnemy: vi.fn(async (_id, data) => ({ ...mockEnemy, ...data })),
  deleteEnemy: vi.fn(async () => true),
}));

describe('/enemies', () => {
  const app = buildApp();
  let token: string;

  beforeAll(async () => {
    await app.ready();
    token = app.jwt.sign({ role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /enemies returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/enemies' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /enemies returns 200 with array', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/enemies',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /enemies returns 201 with created enemy', async () => {
    const body = { name: 'Goblin', color: '#3a8a3a', hpMax: 10, R: 20, sm: 1.0 };
    const res = await app.inject({
      method: 'POST',
      url: '/enemies',
      payload: body,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeDefined();
  });

  it('POST /enemies accepts project and category', async () => {
    const body = {
      name: 'Esquelet',
      color: '#cccccc',
      hpMax: 8,
      R: 20,
      sm: 1.0,
      project: 'La cripta',
      category: 'Morts vivents',
    };
    const res = await app.inject({
      method: 'POST',
      url: '/enemies',
      payload: body,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().project).toBe('La cripta');
    expect(res.json().category).toBe('Morts vivents');
  });

  it('POST /enemies returns 400 when category exceeds 60 characters', async () => {
    const body = {
      name: 'Goblin',
      color: '#3a8a3a',
      hpMax: 10,
      R: 20,
      sm: 1.0,
      category: 'x'.repeat(61),
    };
    const res = await app.inject({
      method: 'POST',
      url: '/enemies',
      payload: body,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it('POST /enemies returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/enemies',
      payload: { name: '' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it('PUT /enemies/:id returns 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/enemies/${mockEnemy.id}`,
      payload: { name: 'Orc' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Orc');
  });

  it('PUT /enemies/:id clears category with an empty string', async () => {
    const { updateEnemy } = await import('../src/modules/enemies/enemy.service');

    const res = await app.inject({
      method: 'PUT',
      url: `/enemies/${mockEnemy.id}`,
      payload: { category: '' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().category).toBe('');
    expect(vi.mocked(updateEnemy)).toHaveBeenLastCalledWith(mockEnemy.id, { category: '' });
  });

  it('PUT /enemies/:id without project/category does not touch them', async () => {
    const { updateEnemy } = await import('../src/modules/enemies/enemy.service');

    const res = await app.inject({
      method: 'PUT',
      url: `/enemies/${mockEnemy.id}`,
      payload: { hpMax: 12 },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const data = vi.mocked(updateEnemy).mock.lastCall?.[1];
    expect(data).not.toHaveProperty('project');
    expect(data).not.toHaveProperty('category');
    expect(res.json().project).toBe('La cripta');
    expect(res.json().category).toBe('Morts vivents');
  });

  it('PUT /enemies/:id returns 404 when not found', async () => {
    const { updateEnemy } = await import('../src/modules/enemies/enemy.service');
    vi.mocked(updateEnemy).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      url: '/enemies/000000000000000000000000',
      payload: { name: 'X' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /enemies/:id returns 204', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/enemies/${mockEnemy.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /enemies/:id returns 404 when not found', async () => {
    const { deleteEnemy } = await import('../src/modules/enemies/enemy.service');
    vi.mocked(deleteEnemy).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/enemies/000000000000000000000000',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('EnemyModel', () => {
  it('serializes legacy documents without project/category as empty strings', () => {
    const legacy = EnemyModel.hydrate({
      _id: '507f1f77bcf86cd799439011',
      name: 'Goblin',
      color: '#3a8a3a',
      hpMax: 10,
      R: 20,
      sm: 1.0,
    });
    expect(legacy.toJSON()).toMatchObject({ project: '', category: '' });
  });

  it('serializes legacy documents without xp as 0', () => {
    const legacy = EnemyModel.hydrate({
      _id: '507f1f77bcf86cd799439011',
      name: 'Goblin',
      color: '#3a8a3a',
      hpMax: 10,
      R: 20,
      sm: 1.0,
    });
    expect(legacy.toJSON()).toMatchObject({ xp: 0 });
  });
});

describe('/enemies xp', () => {
  const app = buildApp();
  let token: string;

  beforeAll(async () => {
    await app.ready();
    token = app.jwt.sign({ role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
  });

  const base = { name: 'Goblin', color: '#3a8a3a', hpMax: 10, R: 20, sm: 1.0 };

  it('POST /enemies defaults xp to 0', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/enemies',
      payload: base,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().xp).toBe(0);
  });

  it('POST /enemies accepts xp', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/enemies',
      payload: { ...base, xp: 50 },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().xp).toBe(50);
  });

  it.each([-1, 2.5, '50'])('POST /enemies rejects xp = %s', async (xp) => {
    const res = await app.inject({
      method: 'POST',
      url: '/enemies',
      payload: { ...base, xp },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /enemies/:id only touches xp when it is in the body', async () => {
    const { updateEnemy } = await import('../src/modules/enemies/enemy.service');

    await app.inject({
      method: 'PUT',
      url: `/enemies/${mockEnemy.id}`,
      payload: { hpMax: 12 },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(vi.mocked(updateEnemy).mock.lastCall?.[1]).not.toHaveProperty('xp');

    await app.inject({
      method: 'PUT',
      url: `/enemies/${mockEnemy.id}`,
      payload: { xp: 200 },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(vi.mocked(updateEnemy)).toHaveBeenLastCalledWith(mockEnemy.id, { xp: 200 });
  });

  describe('5e stat block', () => {
    const base = { name: 'Goblin', color: '#3a8a3a', hpMax: 10, R: 20, sm: 1.0 };
    const post = (extra: object) =>
      app.inject({
        method: 'POST',
        url: '/enemies',
        headers: { Authorization: `Bearer ${token}` },
        payload: { ...base, ...extra },
      });

    it('POST accepts a full stat block and applies defaults', async () => {
      const res = await post({
        cr: '1/4',
        ac: 15,
        speedFt: 30,
        move: 'vol 60',
        abilities: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
        saves: { dex: 4 },
        attacks: [{ name: 'Scimitar', kind: 'melee', reachFt: 5, bonus: '+4', damage: '1d6+2' }],
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().traits).toEqual([]);
      expect(res.json().conditionImmunities).toEqual([]);
      expect(res.json().nonMagicImmunities).toEqual([]);
    });

    it.each([
      ['cr', { cr: '31' }],
      ['ac', { ac: 41 }],
      ['speedFt', { speedFt: 201 }],
      ['ability', { abilities: { str: 31, dex: 1, con: 1, int: 1, wis: 1, cha: 1 } }],
      ['save', { saves: { str: -6 } }],
      ['condition', { conditionImmunities: ['sleepy'] }],
      ['damage type', { nonMagicImmunities: ['sonic'] }],
      ['attack kind', { attacks: [{ name: 'x', kind: 'melee2' }] }],
      ['trait length', { traits: ['x'.repeat(301)] }],
    ])('POST rejects invalid %s', async (_n, extra) => {
      expect((await post(extra)).statusCode).toBe(400);
    });

    it('PUT does not add defaults for omitted stat block fields', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/enemies/${mockEnemy.id}`,
        headers: { Authorization: `Bearer ${token}` },
        payload: { name: 'Renamed' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().traits).toBeUndefined();
      expect(res.json().cr).toBeUndefined();
    });
  });
});
