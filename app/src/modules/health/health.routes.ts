import type { FastifyPluginAsync } from 'fastify';
import { getHealth, isReady } from './health.service';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    return getHealth();
  });

  fastify.get('/health/ready', async (_request, reply) => {
    if (!isReady()) {
      return reply.code(503).send({ status: 'not ready' });
    }
    return reply.send({ status: 'ready' });
  });
};
