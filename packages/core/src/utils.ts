import { ID, ClientID, Clock } from './types';

export function idToKey(id: ID): string {
  return `${id.clientId}:${id.clock}`;
}

export function compareIDs(a: ID, b: ID): number {
  if (a.clientId !== b.clientId) {
    return a.clientId - b.clientId;
  }
  return a.clock - b.clock;
}

export function createID(clientId: ClientID, clock: Clock): ID {
  return { clientId, clock };
}

/**
 * TODO: In a production system we would implement a more sophisticated
 * origin-walking algorithm here for concurrent right-origin conflicts.
 * Current implementation uses a simplified ID-based tie-breaker.
 */