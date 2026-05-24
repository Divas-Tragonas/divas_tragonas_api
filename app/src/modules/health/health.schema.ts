import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  uptime: z.number(),
  db: z.enum(['connected', 'disconnected']),
});

export const readyResponseSchema = z.object({
  status: z.enum(['ready', 'not ready']),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
