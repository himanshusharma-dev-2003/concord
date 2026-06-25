import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken, JwtPayload } from '../auth/jwt';

export interface AuthenticatedRequest extends FastifyRequest {
  user?: JwtPayload;
}

export async function requireAuth(
  request: AuthenticatedRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.split(' ')[1];
  const payload = verifyToken(token);

  if (!payload) {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }

  request.user = payload;
}