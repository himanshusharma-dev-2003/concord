import { Server as SocketIOServer, Socket } from 'socket.io';
import { RgaDocument, RGANode } from 'concord-core';
import { DocumentService } from '../services/documentService';
import { OperationRecord } from '../models/types';

interface ClientState {
  documentId: string;
  clientId: number;
  lastSeen: Date;
  cursorOffset?: number;
}

export class SyncService {
  private io: SocketIOServer;
  private docService: DocumentService;
  private connectedClients = new Map<string, ClientState>(); // socketId -> state

  constructor(io: SocketIOServer, docService: DocumentService) {
    this.io = io;
    this.docService = docService;
    this.setupSocketHandlers();
  }

  private setupSocketHandlers() {
    this.io.on('connection', (socket: Socket) => {
      console.log(`Client connected: ${socket.id}`);

      socket.on('join-document', async (data: { documentId: string; clientId: number }) => {
        await this.handleJoinDocument(socket, data);
      });

      socket.on('crdt-op', async (data: { documentId: string; op: RGANode }) => {
        await this.handleCrdtOp(socket, data);
      });

      socket.on('cursor-move', (data: { documentId: string; offset: number }) => {
        this.handleCursorMove(socket, data);
      });

      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });
    });
  }

  private async handleJoinDocument(
    socket: Socket,
    data: { documentId: string; clientId: number }
  ) {
    const { documentId, clientId } = data;

    // Join the Socket.io room for this document
    socket.join(documentId);

    // Store client state
    this.connectedClients.set(socket.id, {
      documentId,
      clientId,
      lastSeen: new Date(),
    });

    try {
      // Note: For real-time join we use a default owner (0) if document doesn't exist.
      // In production the client should first create the document via REST API.
      const docRecord = await this.docService.createOrGetDocument(documentId, 0);

      // 2. Get current snapshot (if exists)
      let snapshot: RGANode[] | null = docRecord.snapshot;

      // 3. Get all operations since document creation (or since last snapshot)
      const ops = await this.docService.getOperationsSince(documentId);

      // 4. Send initial state to the joining client
      socket.emit('initial-state', {
        documentId,
        snapshot,
        operations: ops.map(op => op.op),
        serverTime: new Date(),
      });

      // 5. Notify others that this user joined and send current presence to the new user
      const roomClients = Array.from(this.connectedClients.entries())
        .filter(([id, state]) => state.documentId === documentId && id !== socket.id)
        .map(([id, state]) => ({ clientId: state.clientId, socketId: id }));

      socket.emit('presence-sync', roomClients);
      
      socket.to(documentId).emit('user-joined', {
        clientId,
        socketId: socket.id
      });

      console.log(`Client ${clientId} joined document ${documentId}`);
    } catch (error) {
      console.error('Error joining document:', error);
      socket.emit('error', { message: 'Failed to join document' });
    }
  }

  private async handleCrdtOp(
    socket: Socket,
    data: { documentId: string; op: RGANode }
  ) {
    const { documentId, op } = data;
    const clientState = this.connectedClients.get(socket.id);

    if (!clientState || clientState.documentId !== documentId) {
      socket.emit('error', { message: 'Not joined to this document' });
      return;
    }

    try {
      // 1. Persist the operation
      await this.docService.persistOperation(documentId, op);

      // 2. Broadcast to all OTHER clients in the room (not the sender)
      socket.to(documentId).emit('crdt-op', {
        documentId,
        op,
        fromClientId: clientState.clientId,
      });

      console.log(`Broadcasted op from client ${clientState.clientId} on doc ${documentId}`);
    } catch (error) {
      console.error('Error handling CRDT op:', error);
      socket.emit('error', { message: 'Failed to process operation' });
    }
  }

  private handleCursorMove(socket: Socket, data: { documentId: string; offset: number }) {
    const clientState = this.connectedClients.get(socket.id);
    if (!clientState || clientState.documentId !== data.documentId) return;

    clientState.cursorOffset = data.offset;
    
    // Broadcast to other clients in the room
    socket.to(data.documentId).emit('cursor-update', {
      clientId: clientState.clientId,
      socketId: socket.id,
      offset: data.offset
    });
  }

  private handleDisconnect(socket: Socket) {
    const clientState = this.connectedClients.get(socket.id);
    if (clientState) {
      this.io.to(clientState.documentId).emit('user-left', {
        clientId: clientState.clientId,
        socketId: socket.id
      });
      this.connectedClients.delete(socket.id);
    }
    console.log(`Client disconnected: ${socket.id}`);
  }

  /**
   * Optional: Periodic snapshot compaction (can be called from a cron job)
   */
  async compactSnapshot(documentId: string) {
    try {
      const doc = await this.docService.reconstructCurrentState(documentId);
      const allNodes = doc.getAllNodes();
      await this.docService.updateSnapshot(documentId, allNodes);
      console.log(`Compacted snapshot for document ${documentId}`);
    } catch (error) {
      console.error('Snapshot compaction failed:', error);
    }
  }
}