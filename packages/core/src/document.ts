import { RGANode, ID, ClientID, Clock } from './types';
import { idToKey, compareIDs, createID } from './utils';

const ROOT_ID: ID = { clientId: 0, clock: 0 };

export class RgaDocument {
  private nodes = new Map<string, RGANode>();
  private readonly clientId: ClientID;
  private clock: Clock = 0;

  constructor(clientId: ClientID) {
    this.clientId = clientId;
    // Create virtual root
    const root: RGANode = {
      id: ROOT_ID,
      char: '',
      deleted: false,
      leftOrigin: null,
      rightOrigin: null,
    };
    this.nodes.set(idToKey(ROOT_ID), root);
  }

  insert(position: number, char: string): RGANode {
    const [leftOrigin, rightOrigin] = this.findOriginsAtPosition(position);

    this.clock += 1;
    const newId = createID(this.clientId, this.clock);

    const newNode: RGANode = {
      id: newId,
      char,
      deleted: false,
      leftOrigin,
      rightOrigin,
    };

    this.integrate(newNode);
    return newNode;
  }

  delete(position: number): RGANode | null {
    const targetNode = this.getVisibleNodeAtPosition(position);
    if (!targetNode || targetNode.id === ROOT_ID) {
      return null;
    }

    targetNode.deleted = true;
    return targetNode;
  }

  applyRemoteOp(remoteNode: RGANode): void {
    if (this.nodes.has(idToKey(remoteNode.id))) {
      // Already seen — idempotent
      return;
    }
    this.integrate(remoteNode);
  }

  mergeSiteState(remoteNodes: RGANode[]): void {
    for (const node of remoteNodes) {
      this.applyRemoteOp(node);
    }
  }

  // ==================== Serialization ====================

  toString(): string {
    const visible: RGANode[] = [];

    for (const node of this.nodes.values()) {
      if (!node.deleted && node.id !== ROOT_ID) {
        visible.push(node);
      }
    }

    if (visible.length === 0) return '';

    // Deterministic sort:
    // 1. Nodes with earlier leftOrigin come first
    // 2. For same leftOrigin, smaller ID wins (clientId then clock)
    visible.sort((a, b) => {
      const aLeftKey = a.leftOrigin ? idToKey(a.leftOrigin) : 'root';
      const bLeftKey = b.leftOrigin ? idToKey(b.leftOrigin) : 'root';

      if (aLeftKey !== bLeftKey) {
        // Root insertions should come before any other leftOrigin
        if (aLeftKey === 'root') return -1;
        if (bLeftKey === 'root') return 1;
        return aLeftKey.localeCompare(bLeftKey);
      }

      return compareIDs(a.id, b.id);
    });

    return visible.map(n => n.char).join('');
  }

  // ==================== Internal Helpers ====================

  private findOriginsAtPosition(position: number): [ID | null, ID | null] {
    let current = this.nodes.get(idToKey(ROOT_ID))!;
    let visibleIndex = 0;
    let lastVisible: RGANode = current;

    while (true) {
      const next = this.findNextVisible(current);
      if (!next) break;

      if (!next.deleted) {
        if (visibleIndex === position) {
          // Insert before this visible node
          return [lastVisible.id, next.id];
        }
        visibleIndex++;
        lastVisible = next;
      }
      current = next;
    }

    // Append at the end
    return [lastVisible.id, null];
  }

  private getVisibleNodeAtPosition(position: number): RGANode | null {
    let current = this.nodes.get(idToKey(ROOT_ID))!;
    let visibleIndex = 0;

    while (true) {
      const next = this.findNextVisible(current);
      if (!next) break;

      if (!next.deleted) {
        if (visibleIndex === position) {
          return next;
        }
        visibleIndex++;
      }
      current = next;
    }
    return null;
  }

  private integrate(newNode: RGANode): void {
    this.nodes.set(idToKey(newNode.id), newNode);

    // The node is now part of the graph.
    // Actual linearization happens lazily in findNextVisible / toString.
    // TODO: Implement a more aggressive conflict-resolution walk
    //       when multiple items share the same leftOrigin/rightOrigin pair.
    //       Current simple ID tie-breaker is sufficient for most cases.
  }

  private findNextVisible(start: RGANode): RGANode | null {
    const candidates: RGANode[] = [];

    for (const node of this.nodes.values()) {
      if (node.leftOrigin && this.idsEqual(node.leftOrigin, start.id)) {
        candidates.push(node);
      }
    }

    if (candidates.length === 0) {
      if (start.rightOrigin) {
        const rightNode = this.nodes.get(idToKey(start.rightOrigin));
        if (rightNode) {
          return this.findNextVisible(rightNode);
        }
      }
      return null;
    }

    // Sort by ID to get deterministic order among concurrent siblings
    candidates.sort((a, b) => compareIDs(a.id, b.id));

    return candidates[0];
  }

  private idsEqual(a: ID, b: ID): boolean {
    return a.clientId === b.clientId && a.clock === b.clock;
  }

  // ==================== Debugging / Inspection ====================

  /**
   * Returns all nodes (including tombstones) for testing and debugging.
   */
  getAllNodes(): RGANode[] {
    return Array.from(this.nodes.values());
  }

  getClientId(): ClientID {
    return this.clientId;
  }

  /**
   * TODO: Add a garbageCollection() method that removes tombstones
   * whose deletion has been acknowledged by all known peers.
   * This requires vector clocks or a separate GC protocol.
   */
}