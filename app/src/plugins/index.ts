import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

export function registerPlugins(app: FastifyInstance): void {
  app.register(cors);
  app.register(helmet);
}
