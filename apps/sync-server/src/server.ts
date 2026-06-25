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
// Basic CORS handling to allow calls from the frontend dev server
fastify.addHook('onRequest', async (request, reply) => {
  reply.header('Access-Control-Allow-Origin', '*');
  reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (request.method === 'OPTIONS') {
    // Respond to preflight requests immediately
    reply.code(204).send();
  }
});

// Debug: log incoming requests and headers to help diagnose CORS/auth issues
fastify.addHook('preHandler', async (request, reply) => {
  try {
    console.log('Incoming request:', request.method, request.url);
    console.log('Request headers:', request.headers);
  } catch (e) {
    // ignore logging errors
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

// Time-travel reconstruction (protected via documentRoutes)
fastify.get('/documents/:id/reconstruct', {
  preHandler: require('./middleware/auth').requireAuth
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const { at } = request.query as { at?: string };

  if (!at) {
    return reply.code(400).send({ error: 'Missing "at" query parameter (ISO timestamp)' });
  }

  try {
    const targetTime = new Date(at);
    const text = await docService.reconstructDocumentAt(id, targetTime);
    return { documentId: id, at: targetTime.toISOString(), text };
  } catch (err) {
    return reply.code(500).send({ error: 'Reconstruction failed' });
  }
});

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001', 10);

    // Listen on all network interfaces
    await fastify.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 CRDT Backend running on http://localhost:${port}`);
    console.log(`   WebSocket: ws://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();