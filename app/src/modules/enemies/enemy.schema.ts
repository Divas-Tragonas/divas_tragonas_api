import { z } from 'zod';

export const enemySchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  hpMax: z.number().int().min(1),
  R: z.number().int().min(8).max(200),
  sm: z.number().min(0.1).max(5.0),
  imageData: z.string().optional(),
});

export const createEnemySchema = enemySchema.omit({ id: true });

export const updateEnemySchema = createEnemySchema.partial();

export type Enemy = z.infer<typeof enemySchema>;
export type CreateEnemy = z.infer<typeof createEnemySchema>;
export type UpdateEnemy = z.infer<typeof updateEnemySchema>;
