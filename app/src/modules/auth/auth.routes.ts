import type { FastifyPluginAsync } from 'fastify';
import { loginSchema } from './auth.schema';
import { validatePassword } from './auth.service';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Cos de la petició invàlid' });
    }

    if (!validatePassword(parsed.data.password)) {
      return reply.code(401).send({ error: 'Contrasenya incorrecta' });
    }

    const token = fastify.jwt.sign({ role: 'admin' }, { expiresIn: '7d' });
    return reply.send({ token });
  });
};
