import { FastifyInstance } from 'fastify';
import { DocumentService } from './documentService';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';

export async function documentRoutes(fastify: FastifyInstance) {
  const docService = new DocumentService();

  // Protected routes
  fastify.register(async (fastify) => {
    fastify.addHook('preHandler', requireAuth);

    // List my documents
    fastify.get('/documents', async (request: AuthenticatedRequest, reply) => {
      const userId = request.user!.userId;
      const docs = await docService.listUserDocuments(userId);
      return docs;
    });

    // Create a new document
    fastify.post('/documents', {
      schema: {
        body: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 100 },
            id: { type: 'string', pattern: '^[a-zA-Z0-9_-]+$' }
          }
        }
      }
    }, async (request: AuthenticatedRequest, reply) => {
      const userId = request.user!.userId;
      const { title, id } = request.body as { title?: string; id?: string };

      const docId = id || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const doc = await docService.createOrGetDocument(docId, userId, title);

      return doc;
    });

    // Get a specific document (must be owner or have share)
    fastify.get('/documents/:id', {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' }
          }
        }
      }
    }, async (request: AuthenticatedRequest, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };

      const hasAccess = await docService.canUserAccessDocument(userId, id);
      if (!hasAccess) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      const doc = await docService.getDocument(id);
      return doc;
    });

    // Create share link
    fastify.post('/documents/:id/share', {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          properties: {
            permission: { type: 'string', enum: ['read', 'edit'] }
          }
        }
      }
    }, async (request: AuthenticatedRequest, reply) => {
      const userId = request.user!.userId;
      const { id } = request.params as { id: string };
      const { permission = 'edit' } = request.body as { permission?: 'read' | 'edit' };

      const hasAccess = await docService.canUserAccessDocument(userId, id);
      if (!hasAccess) {
        return reply.code(403).send({ error: 'Access denied' });
      }

      const shareToken = await docService.createShareLink(id, permission);
      return { shareToken, url: `/join?token=${shareToken}` };
    });
  });

  // Public join via share token (no auth required)
  fastify.get('/join', {
    schema: {
      querystring: {
        type: 'object',
        required: ['token'],
        properties: {
          token: { type: 'string', minLength: 1 }
        }
      }
    }
  }, async (request, reply) => {
    const { token } = request.query as { token: string };

    const result = await docService.getDocumentByShareToken(token);
    if (!result) {
      return reply.code(404).send({ error: 'Invalid or expired share link' });
    }

    return {
      document: result.document,
      permission: result.permission,
      shareToken: token,
    };
  });
}