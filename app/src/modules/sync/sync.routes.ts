import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../../config/env';
import { syncService } from './sync.service';

// Message types that the DM sends and all clients should receive
const ROUTABLE_TO_CLIENTS = new Set([
  'STATE', 'STRUCT',
  'BG_META', 'EXPOSITOR_SHOW_META',
  'STROKE', 'CLEAR_DRAW', 'UNDO_DRAW',
  'POINTER', 'SPELL', 'TOKEN_RELAY',
  'BOSS_INTRO', 'BOSS_INTRO_SKIP',
  'EXPOSITOR_HIDE', 'EXPOSITOR_SYNC',
]);

// Message types that clients send and only the DM should receive
// VIEWPORT: each player screen reports its size so the DM knows how many are
// connected and how much map they see outside his framing
const ROUTABLE_TO_DM = new Set(['TOKEN_MOVE', 'PLAYER_READY', 'VIEWPORT']);

export async function syncRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sync', { websocket: true }, (connection, req: FastifyRequest) => {
    const query = req.query as Record<string, string>;

    // The API is exposed publicly through Tailscale Funnel; when SYNC_KEY is
    // set, only connections carrying the matching ?key= are accepted.
    if (env.SYNC_KEY && query['key'] !== env.SYNC_KEY) {
      app.log.warn({ ip: req.ip }, 'sync connection rejected: invalid key');
      connection.socket.close(4401, 'invalid key');
      return;
    }

    const role = query['role'] === 'dm' ? 'dm' : 'client';
    const id = `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    syncService.add(id, connection.socket, role);
    app.log.info({ role, id, clients: syncService.clientCount() }, 'sync client connected');

    // Late-joining clients get the last known STRUCT immediately
    if (role === 'client') {
      const cached = syncService.getLastStruct();
      if (cached) {
        try { connection.socket.send(cached); } catch { /* ignore */ }
      }
    }

    connection.socket.on('message', (raw: Buffer, isBinary: boolean) => {
      if (isBinary) {
        // Binary frame = BG image/video or expositor media — only DM sends binary
        syncService.broadcastBinary(raw, id);
        return;
      }
      try {
        const msg = JSON.parse(raw.toString()) as { type: string };
        // Cache STRUCT so late joiners get the full state
        if (msg.type === 'STRUCT') {
          syncService.cacheStruct(raw.toString());
        }
        if (ROUTABLE_TO_CLIENTS.has(msg.type)) {
          syncService.broadcast(raw.toString(), id);
        }
        if (ROUTABLE_TO_DM.has(msg.type)) {
          syncService.sendToDM(raw.toString());
        }
      } catch {
        /* ignore malformed JSON */
      }
    });

    connection.socket.on('close', () => {
      syncService.remove(id);
      app.log.info({ role, id, clients: syncService.clientCount() }, 'sync client disconnected');
    });
  });
}
