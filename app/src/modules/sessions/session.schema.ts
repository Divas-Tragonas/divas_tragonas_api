import { z } from 'zod';

// `data` is the full serialized game state. It is an arbitrary object whose
// inner shape the frontend owns and evolves freely, so we validate ONLY that it
// is an object — never its contents. `z.record(z.unknown())` accepts any plain
// object (and rejects arrays / primitives) without constraining the values.
const dataSchema = z.record(z.unknown());

export const createSessionSchema = z.object({
  name: z.string().min(1).max(120),
  data: dataSchema,
});

// PUT overwrites: both fields optional, but at least one must be present.
export const updateSessionSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    data: dataSchema.optional(),
  })
  .refine((body) => body.name !== undefined || body.data !== undefined, {
    message: 'At least one of "name" or "data" must be provided',
  });

export type CreateSession = z.infer<typeof createSessionSchema>;
export type UpdateSession = z.infer<typeof updateSessionSchema>;

// Lightweight list item — no `data` blob.
export interface SessionMeta {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  sizeBytes: number;
}

// Full session — metadata plus the opaque game-state blob.
export interface Session extends SessionMeta {
  data: unknown;
}
