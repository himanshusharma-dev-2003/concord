import { query } from '../persistence/db';
import { RGANode, RgaDocument } from 'concord-core';
import { DocumentRecord, OperationRecord } from '../models/types';

export class DocumentService {
  async createOrGetDocument(docId: string, ownerId: number, title = 'Untitled Document'): Promise<DocumentRecord> {
    const existing = await this.getDocument(docId);
    if (existing) return existing;

    const result = await query(
      `INSERT INTO documents (id, owner_id, title, snapshot) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [docId, ownerId, title, null]
    );
    return result.rows[0];
  }

  async getDocument(docId: string): Promise<DocumentRecord | null> {
    const result = await query(`SELECT * FROM documents WHERE id = $1`, [docId]);
    return result.rows[0] || null;
  }

  async listUserDocuments(userId: number): Promise<DocumentRecord[]> {
    const result = await query(
      `SELECT * FROM documents WHERE owner_id = $1 ORDER BY updated_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async persistOperation(docId: string, node: RGANode): Promise<OperationRecord> {
    const result = await query(
      `INSERT INTO operations (document_id, op, client_id, clock)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [docId, node, node.id.clientId, node.id.clock]
    );
    return result.rows[0];
  }

  async getOperationsSince(docId: string, since?: Date): Promise<OperationRecord[]> {
    let sql = `SELECT * FROM operations WHERE document_id = $1`;
    const params: any[] = [docId];

    if (since) {
      sql += ` AND created_at > $2`;
      params.push(since);
    }
    sql += ` ORDER BY created_at ASC`;

    const result = await query(sql, params);
    return result.rows;
  }

  async getSnapshot(docId: string): Promise<RGANode[] | null> {
    const doc = await this.getDocument(docId);
    return doc?.snapshot || null;
  }

  async updateSnapshot(docId: string, nodes: RGANode[]): Promise<void> {
    await query(
      `UPDATE documents SET snapshot = $2, updated_at = NOW() WHERE id = $1`,
      [docId, nodes]
    );
  }

  // ==================== Sharing ====================

  async createShareLink(docId: string, permission: 'read' | 'edit' = 'edit'): Promise<string> {
    const shareToken = `share_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    await query(
      `INSERT INTO document_shares (document_id, share_token, permission) 
       VALUES ($1, $2, $3)`,
      [docId, shareToken, permission]
    );

    return shareToken;
  }

  async getDocumentByShareToken(shareToken: string): Promise<{ document: DocumentRecord; permission: string } | null> {
    const result = await query(
      `SELECT d.*, ds.permission 
       FROM documents d
       JOIN document_shares ds ON ds.document_id = d.id
       WHERE ds.share_token = $1`,
      [shareToken]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      document: {
        id: row.id,
        title: row.title,
        snapshot: row.snapshot,
        updated_at: row.updated_at,
        owner_id: row.owner_id,
      },
      permission: row.permission,
    };
  }

  async canUserAccessDocument(userId: number, docId: string): Promise<boolean> {
    const doc = await this.getDocument(docId);
    if (!doc) return false;

    // Owner always has access
    if (doc.owner_id === userId) return true;

    // Check if user has a share
    const shareResult = await query(
      `SELECT 1 FROM document_shares 
       WHERE document_id = $1 AND shared_with = $2`,
      [docId, userId]
    );

    return shareResult.rows.length > 0;
  }

  // ==================== Reconstruction ====================

  async reconstructDocumentAt(
    docId: string,
    targetTime: Date,
    clientIdForReplay = 999
  ): Promise<string> {
    const ops = await query(
      `SELECT op FROM operations 
       WHERE document_id = $1 AND created_at <= $2 
       ORDER BY created_at ASC`,
      [docId, targetTime]
    );

    const doc = new RgaDocument(clientIdForReplay);
    for (const row of ops.rows) {
      doc.applyRemoteOp(row.op);
    }
    return doc.toString();
  }

  async reconstructCurrentState(docId: string): Promise<RgaDocument> {
    const opsResult = await query(
      `SELECT op FROM operations WHERE document_id = $1 ORDER BY created_at ASC`,
      [docId]
    );

    const doc = new RgaDocument(0);
    for (const row of opsResult.rows) {
      doc.applyRemoteOp(row.op);
    }
    return doc;
  }
}