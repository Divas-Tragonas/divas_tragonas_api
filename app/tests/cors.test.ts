import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server';

vi.mock('../src/config/db', () => ({
  connectDb: vi.fn(),
  disconnectDb: vi.fn(),
  getDbStatus: vi.fn(() => 'connected'),
}));

describe('CORS', () => {
  const app = buildApp();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows requests from the Vercel frontend origin', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/enemies',
      headers: {
        origin: 'https://rpg-map-viewer.vercel.app',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'Content-Type, Authorization',
      },
    });

    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('GET');
  });

  it('sends the allow-origin header on actual GET responses', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'https://rpg-map-viewer.vercel.app' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('*');
  });
});
