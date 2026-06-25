import { FastifyInstance } from 'fastify';
import { AuthService } from '../auth/authService';

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService();

  fastify.post('/auth/signup', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required' });
    }

    try {
      const user = await authService.signup(email, password);
      return { user };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.post('/auth/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.code(400).send({ error: 'Email and password required' });
    }

    try {
      const { user, token } = await authService.login(email, password);
      return { user, token };
    } catch (err: any) {
      return reply.code(401).send({ error: err.message });
    }
  });
}