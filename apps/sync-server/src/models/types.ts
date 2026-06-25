import { RGANode } from 'concord-core';

export interface DocumentRecord {
  id: string;
  owner_id: number;
  title: string;
  snapshot: RGANode[] | null;
  updated_at: string;
  share_token?: string | null;
}

export interface OperationRecord {
  id: number;
  document_id: string;
  op: RGANode;
  client_id: number;
  clock: number;
  created_at: string;
}

export interface ClientConnection {
  clientId: number;
  socketId: string;
}