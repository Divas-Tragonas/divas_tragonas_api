import { z } from 'zod';

export const loginSchema = z.object({
  password: z.string().min(1),
});

export const loginResponseSchema = z.object({
  token: z.string(),
});

export type LoginInput = z.infer<typeof loginSchema>;
