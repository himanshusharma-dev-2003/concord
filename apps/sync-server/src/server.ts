import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { DocumentService } from './services/documentService';
import { SyncService } from './websocket/sync';
import { authRoutes } from './services/authRoutes';
import { documentRoutes } from './services/documentRoutes';
import { requireAuth } from './middleware/auth';
import dotenv from 'dotenv';
import path from 'path';
import fastifyStatic from '@fastify/static';

dotenv.config();

const fastify = Fastify({ logger: true });
// CORS — allow the configured origin (or all origins in development).
// In production, set CORS_ORIGIN to the frontend's URL.
const allowedOrigin = process.env.CORS_ORIGIN || '*';
fastify.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', allowedOrigin);
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    reply.code(204).send();
  }
});
const io = new SocketIOServer(fastify.server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const docService = new DocumentService();
const syncService = new SyncService(io, docService);

// Register routes
fastify.register(authRoutes);
fastify.register(documentRoutes);

// Health check
fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date() };
});

// Serve frontend in CLI mode
if (process.env.CLI_MODE === 'true') {
  fastify.register(fastifyStatic, {
    root: path.join(__dirname, '../../frontend/dist'),
    prefix: '/',
  });
  
  // SPA fallback
  fastify.setNotFoundHandler((request, reply) => {
    reply.sendFile('index.html');
  });
}

// Time-travel reconstruction — replay all operations up to a given ISO timestamp.
fastify.get('/documents/:id/reconstruct', {
  preHandler: requireAuth,
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const { at } = request.query as { at?: string };

  if (!at) {
    return reply.code(400).send({ error: 'Missing "at" query parameter (ISO 8601 timestamp)' });
  }

  const targetTime = new Date(at);
  if (isNaN(targetTime.getTime())) {
    return reply.code(400).send({ error: '"at" is not a valid ISO 8601 timestamp' });
  }

  try {
    const text = await docService.reconstructDocumentAt(id, targetTime);
    return { documentId: id, at: targetTime.toISOString(), text };
  } catch (err) {
    fastify.log.error(err, 'Time-travel reconstruction failed');
    return reply.code(500).send({ error: 'Reconstruction failed' });
  }
});

// Start server
const start = async () => {
  // Warn loudly if the default JWT secret is used outside of development.
  // This prevents accidental deployment with an insecure secret.
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret-change-in-production')
  ) {
    fastify.log.warn(
      'JWT_SECRET is not set or is using the insecure default value. ' +
      'Set a strong, random JWT_SECRET environment variable before deploying to production.'
    );
  }

  try {
    const port = parseInt(process.env.PORT || '3001', 10);
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`🚀 Concord sync server running on http://localhost:${port}`);
    fastify.log.info(`   WebSocket endpoint: ws://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();