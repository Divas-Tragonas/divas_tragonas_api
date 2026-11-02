import type { FastifyPluginAsync } from 'fastify';
import type { ZodError } from 'zod';
import {
  awardXpBatchSchema,
  awardXpSchema,
  createCharacterSchema,
  updateCharacterSchema,
} from './character.schema';
import {
  awardXp,
  awardXpBatch,
  createCharacter,
  deleteCharacter,
  getAllCharacters,
  getCharacterById,
  updateCharacter,
} from './character.service';

// The sheet is capped at 512KB and the portrait at 1MB; leave room for both
// plus JSON overhead (Fastify's default limit is 1MB).
const CHARACTER_BODY_LIMIT = 2 * 1024 * 1024;

const NOT_FOUND = { error: 'Character not found' };

function firstIssue(error: ZodError): { error: string } {
  const issue = error.issues[0];
  if (!issue) return { error: 'Invalid body' };
  const path = issue.path.join('.');
  return { error: path ? `${path}: ${issue.message}` : issue.message };
}

export const characterRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /characters -> every character, WITHOUT xpLog.
  fastify.get('/characters', { preHandler: [fastify.authenticate] }, async (_request, reply) => {
    return reply.send(await getAllCharacters());
  });

  // GET /characters/:id -> the full character, xpLog included.
  fastify.get<{ Params: { id: string } }>(
    '/characters/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const character = await getCharacterById(request.params.id);
      if (!character) return reply.code(404).send(NOT_FOUND);
      return reply.send(character);
    },
  );

  fastify.post(
    '/characters',
    { preHandler: [fastify.authenticate], bodyLimit: CHARACTER_BODY_LIMIT },
    async (request, reply) => {
      const parsed = createCharacterSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(firstIssue(parsed.error));
      return reply.code(201).send(await createCharacter(parsed.data));
    },
  );

  // POST /characters/xp -> award XP to several characters (end of a combat).
  // Registered as a static route, so it never collides with /characters/:id.
  fastify.post('/characters/xp', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const parsed = awardXpBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(firstIssue(parsed.error));
    const result = await awardXpBatch(parsed.data);
    if (!result.ok) {
      return reply.code(404).send({ error: `Character not found: ${result.missing}` });
    }
    return reply.send(result.characters);
  });

  fastify.post<{ Params: { id: string } }>(
    '/characters/:id/xp',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = awardXpSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(firstIssue(parsed.error));
      const character = await awardXp(request.params.id, parsed.data);
      if (!character) return reply.code(404).send(NOT_FOUND);
      return reply.send(character);
    },
  );

  fastify.put<{ Params: { id: string } }>(
    '/characters/:id',
    { preHandler: [fastify.authenticate], bodyLimit: CHARACTER_BODY_LIMIT },
    async (request, reply) => {
      const parsed = updateCharacterSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(firstIssue(parsed.error));
      const character = await updateCharacter(request.params.id, parsed.data);
      if (!character) return reply.code(404).send(NOT_FOUND);
      return reply.send(character);
    },
  );

  fastify.delete<{ Params: { id: string } }>(
    '/characters/:id',
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const deleted = await deleteCharacter(request.params.id);
      if (!deleted) return reply.code(404).send(NOT_FOUND);
      return reply.code(204).send();
    },
  );
};
