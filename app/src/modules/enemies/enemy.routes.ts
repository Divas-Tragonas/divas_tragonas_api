import type { FastifyPluginAsync } from 'fastify';
import { createEnemySchema, updateEnemySchema } from './enemy.schema';
import { getAllEnemies, createEnemy, updateEnemy, deleteEnemy } from './enemy.service';

export const enemyRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/enemies', async (_request, reply) => {
    const enemies = await getAllEnemies();
    return reply.send(enemies);
  });

  fastify.post('/enemies', async (request, reply) => {
    const parsed = createEnemySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    }
    const enemy = await createEnemy(parsed.data);
    return reply.code(201).send(enemy);
  });

  fastify.put<{ Params: { id: string } }>('/enemies/:id', async (request, reply) => {
    const parsed = updateEnemySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
    }
    const enemy = await updateEnemy(request.params.id, parsed.data);
    if (!enemy) {
      return reply.code(404).send({ error: 'Enemy not found' });
    }
    return reply.send(enemy);
  });

  fastify.delete<{ Params: { id: string } }>('/enemies/:id', async (request, reply) => {
    const deleted = await deleteEnemy(request.params.id);
    if (!deleted) {
      return reply.code(404).send({ error: 'Enemy not found' });
    }
    return reply.code(204).send();
  });
};
