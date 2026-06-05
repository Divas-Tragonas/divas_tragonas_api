import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server';

vi.mock('../src/config/db', () => ({
  connectDb: vi.fn(),
  disconnectDb: vi.fn(),
  getDbStatus: vi.fn(() => 'connected'),
}));

describe('/auth', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login returns 200 with token on valid password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: 'test-password' },
    });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().token).toBe('string');
  });

  it('POST /auth/login returns 401 on wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBeDefined();
  });

  it('POST /auth/login returns 400 on missing password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it('returned token is a valid JWT with admin role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { password: 'test-password' },
    });
    const { token } = res.json();
    const payload = app.jwt.verify<{ role: string }>(token);
    expect(payload.role).toBe('admin');
  });
});
