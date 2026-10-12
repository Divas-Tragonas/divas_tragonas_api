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
});
