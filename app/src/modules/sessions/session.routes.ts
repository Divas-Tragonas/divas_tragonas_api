import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env';
import { createSessionSchema, updateSessionSchema } from './session.schema';
import {
  getAllSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
} from './session.service';

export const sessionRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /sessions -> lightweight list (SessionMeta[], no `data` blob).
  fastify.get('/sessions', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    const sessions = await getAllSessions();
    return reply.send(sessions);
  });

  // GET /sessions/:id -> full session including the `data` blob.
  fastify.get<{ Params: { id: string } }>(
    '/sessions/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const session = await getSessionById(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return reply.send(session);
    },
  );

  // POST /sessions -> create. `data` can reach tens of MB (base64 images,
  // video backgrounds), so the body limit is raised well beyond Fastify's 1MB
  // default; oversized payloads get a 413 from the parser automatically.
  fastify.post(
    '/sessions',
    { preHandler: [fastify.authenticate], bodyLimit: env.MAX_UPLOAD_BYTES },
    async (request, reply) => {
      const parsed = createSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
      }
      const session = await createSession(parsed.data);
      return reply.code(201).send(session);
    },
  );

  // PUT /sessions/:id -> overwrite name and/or data.
  fastify.put<{ Params: { id: string } }>(
    '/sessions/:id',
    { preHandler: [fastify.authenticate], bodyLimit: env.MAX_UPLOAD_BYTES },
    async (request, reply) => {
      const parsed = updateSessionSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
      }
      const session = await updateSession(request.params.id, parsed.data);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return reply.send(session);
    },
  );

  // DELETE /sessions/:id -> remove metadata and the GridFS blob.
  fastify.delete<{ Params: { id: string } }>(
    '/sessions/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const deleted = await deleteSession(request.params.id);
      if (!deleted) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return reply.code(204).send();
    },
  );
};
