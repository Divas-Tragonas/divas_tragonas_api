import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { env } from './config/env';
import { connectDb, disconnectDb } from './config/db';
import { registerPlugins } from './plugins';
import { healthRoutes } from './modules/health/health.routes';
import { enemyRoutes } from './modules/enemies/enemy.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { syncRoutes } from './modules/sync/sync.routes';

export function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  registerPlugins(app);
  app.register(websocket);
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(enemyRoutes);
  app.register(syncRoutes);

  return app;
}

async function main() {
  const app = buildApp();

  await connectDb(app.log);

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    await disconnectDb();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
}

// Guard against running when imported in tests
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
