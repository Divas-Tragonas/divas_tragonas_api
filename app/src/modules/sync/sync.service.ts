import type { WebSocket } from 'ws';

type Role = 'dm' | 'client';

interface SyncClient {
  ws: WebSocket;
  role: Role;
}

const clients = new Map<string, SyncClient>();
let lastStruct: string | null = null;

export const syncService = {
  add(id: string, ws: WebSocket, role: Role): void {
    clients.set(id, { ws, role });
  },

  remove(id: string): void {
    clients.delete(id);
  },

  cacheStruct(raw: string): void {
    lastStruct = raw;
  },

  getLastStruct(): string | null {
    return lastStruct;
  },

  broadcast(raw: string, excludeId: string): void {
    clients.forEach(({ ws }, id) => {
      if (id !== excludeId && ws.readyState === ws.OPEN) {
        try { ws.send(raw); } catch { /* ignore closed socket */ }
      }
    });
  },

  broadcastBinary(data: Buffer, excludeId: string): void {
    clients.forEach(({ ws }, id) => {
      if (id !== excludeId && ws.readyState === ws.OPEN) {
        try { ws.send(data); } catch { /* ignore closed socket */ }
      }
    });
  },

  sendToDM(raw: string): void {
    clients.forEach(({ ws, role }) => {
      if (role === 'dm' && ws.readyState === ws.OPEN) {
        try { ws.send(raw); } catch { /* ignore closed socket */ }
      }
    });
  },

  clientCount(): number {
    return clients.size;
  },
};
