import { getDbStatus } from '../../config/db';
import type { HealthResponse } from './health.schema';

export function getHealth(): HealthResponse {
  return {
    status: 'ok',
    uptime: process.uptime(),
    db: getDbStatus(),
  };
}

export function isReady(): boolean {
  return getDbStatus() === 'connected';
}
