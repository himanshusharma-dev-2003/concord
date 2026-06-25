export type ClientID = number;
export type Clock = number;

export interface ID {
  clientId: ClientID;
  clock: Clock;
}

export interface RGANode {
  id: ID;
  char: string;           // single character or "" for structural nodes
  deleted: boolean;       // tombstone
  leftOrigin: ID | null;
  rightOrigin: ID | null;
}

/**
 * TODO: Consider adding a `length` field for run-length encoding of identical consecutive characters
 * to reduce node count for large documents.
 */