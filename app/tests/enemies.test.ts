import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server';

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
};

vi.mock('../src/modules/enemies/enemy.service', () => ({
  getAllEnemies: vi.fn(async () => [mockEnemy]),
  createEnemy: vi.fn(async (data) => ({ ...data, id: mockEnemy.id })),
  updateEnemy: vi.fn(async (_id, data) => ({ ...mockEnemy, ...data })),
  deleteEnemy: vi.fn(async () => true),
}));

describe('/enemies', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /enemies returns 200 with array', async () => {
    const res = await app.inject({ method: 'GET', url: '/enemies' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
  });

  it('POST /enemies returns 201 with created enemy', async () => {
    const body = { name: 'Goblin', color: '#3a8a3a', hpMax: 10, R: 20, sm: 1.0 };
    const res = await app.inject({ method: 'POST', url: '/enemies', payload: body });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeDefined();
  });

  it('POST /enemies returns 400 for invalid body', async () => {
    const res = await app.inject({ method: 'POST', url: '/enemies', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it('PUT /enemies/:id returns 200', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/enemies/${mockEnemy.id}`,
      payload: { name: 'Orc' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Orc');
  });

  it('PUT /enemies/:id returns 404 when not found', async () => {
    const { updateEnemy } = await import('../src/modules/enemies/enemy.service');
    vi.mocked(updateEnemy).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      url: '/enemies/000000000000000000000000',
      payload: { name: 'X' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /enemies/:id returns 204', async () => {
    const res = await app.inject({ method: 'DELETE', url: `/enemies/${mockEnemy.id}` });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /enemies/:id returns 404 when not found', async () => {
    const { deleteEnemy } = await import('../src/modules/enemies/enemy.service');
    vi.mocked(deleteEnemy).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/enemies/000000000000000000000000',
    });
    expect(res.statusCode).toBe(404);
  });
});
