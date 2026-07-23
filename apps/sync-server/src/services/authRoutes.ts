import { FastifyInstance } from 'fastify';
import { AuthService } from '../auth/authService';

export async function authRoutes(fastify: FastifyInstance) {
  const authService = new AuthService();

  fastify.post('/auth/signup', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { 
            type: 'string', 
            pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$',
            description: 'Must be a valid email address'
          },
          password: { 
            type: 'string', 
            minLength: 6,
            description: 'Password must be at least 6 characters long'
          }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    try {
      const user = await authService.signup(email, password);
      return { user };
    } catch (err: any) {
      return reply.code(400).send({ error: err.message });
    }
  });

  fastify.post('/auth/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string' },
          password: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    try {
      const { user, token } = await authService.login(email, password);
      return { user, token };
    } catch (err: any) {
      return reply.code(401).send({ error: err.message });
    }
  });
}