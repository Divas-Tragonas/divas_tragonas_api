import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/server';

vi.mock('../src/config/db', () => ({
  connectDb: vi.fn(),
  disconnectDb: vi.fn(),
  getDbStatus: vi.fn(() => 'connected'),
}));

const mockMeta = {
  id: '507f1f77bcf86cd799439011',
  name: 'Combat a la taverna',
  createdAt: '2026-07-16T10:00:00.000Z',
  updatedAt: '2026-07-16T10:00:00.000Z',
  sizeBytes: 42,
};

const mockSession = { ...mockMeta, data: { enemies: [], map: { bg: 'x' } } };

vi.mock('../src/modules/sessions/session.service', () => ({
  getAllSessions: vi.fn(async () => [mockMeta]),
  getSessionById: vi.fn(async () => mockSession),
  createSession: vi.fn(async (input) => ({ ...mockSession, ...input })),
  updateSession: vi.fn(async (_id, input) => ({ ...mockSession, ...input })),
  deleteSession: vi.fn(async () => true),
}));

describe('/sessions', () => {
  const app = buildApp();
  let token: string;

  beforeAll(async () => {
    await app.ready();
    token = app.jwt.sign({ role: 'admin' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows CORS preflight (OPTIONS) on /sessions', async () => {
    const res = await app.inject({
      method: 'OPTIONS',
      url: '/sessions',
      headers: {
        origin: 'https://rpg-map-viewer.vercel.app',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'Content-Type, Authorization',
      },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.headers['access-control-allow-origin']).toBe('*');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('GET /sessions returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/sessions' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /sessions returns a lightweight list without the data blob', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/sessions',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].sizeBytes).toBe(42);
    expect(body[0].data).toBeUndefined();
  });

  it('GET /sessions/:id returns the full session with data', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/sessions/${mockMeta.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toBeDefined();
  });

  it('GET /sessions/:id returns 404 when not found', async () => {
    const { getSessionById } = await import('../src/modules/sessions/session.service');
    vi.mocked(getSessionById).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'GET',
      url: '/sessions/000000000000000000000000',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBeDefined();
  });

  it('POST /sessions returns 201 with the created session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { name: 'Nova partida', data: { foo: 'bar' } },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().id).toBeDefined();
    expect(res.json().data).toEqual({ foo: 'bar' });
  });

  it('POST /sessions returns 400 when data is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { name: 'Sense data' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it('POST /sessions returns 400 when name is empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { name: '', data: { foo: 'bar' } },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /sessions accepts a payload far larger than Fastify\'s 1MB default', async () => {
    // A ~2MB body would be rejected with 413 under the default limit; it must
    // pass here because the /sessions routes raise the body limit (CANVI 4).
    const big = 'x'.repeat(2 * 1024 * 1024);
    const res = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { name: 'Fons gran', data: { image: big } },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(201);
  });

  it('POST /sessions returns 413 when the payload exceeds MAX_UPLOAD_BYTES', async () => {
    // MAX_UPLOAD_BYTES is 24MB under test (see vitest.config.ts), so a ~25MB
    // body must be rejected by the parser rather than reaching the handler.
    const tooBig = 'x'.repeat(25 * 1024 * 1024);
    const res = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { name: 'Massa gran', data: { image: tooBig } },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(413);
  });

  it('PUT /sessions/:id returns 413 when the payload exceeds MAX_UPLOAD_BYTES', async () => {
    const tooBig = 'x'.repeat(25 * 1024 * 1024);
    const res = await app.inject({
      method: 'PUT',
      url: `/sessions/${mockMeta.id}`,
      payload: { name: 'Massa gran', data: { image: tooBig } },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(413);
  });

  it('PUT /sessions/:id returns 200 and overwrites', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/sessions/${mockMeta.id}`,
      payload: { name: 'Renomenada' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe('Renomenada');
  });

  it('PUT /sessions/:id returns 400 when body is empty', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/sessions/${mockMeta.id}`,
      payload: {},
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PUT /sessions/:id returns 404 when not found', async () => {
    const { updateSession } = await import('../src/modules/sessions/session.service');
    vi.mocked(updateSession).mockResolvedValueOnce(null);

    const res = await app.inject({
      method: 'PUT',
      url: '/sessions/000000000000000000000000',
      payload: { name: 'X' },
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('DELETE /sessions/:id returns 204', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/sessions/${mockMeta.id}`,
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('DELETE /sessions/:id returns 404 when not found', async () => {
    const { deleteSession } = await import('../src/modules/sessions/session.service');
    vi.mocked(deleteSession).mockResolvedValueOnce(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/sessions/000000000000000000000000',
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(404);
  });
});
