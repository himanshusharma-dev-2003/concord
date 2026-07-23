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

  // ==================== Serialization & Traversal ====================

  /**
   * Generates the linearized list of all nodes in the document using a depth-first
   * traversal of the leftOrigin tree, sorting concurrent siblings deterministically.
   */
  private getNodesInOrder(): RGANode[] {
    const result: RGANode[] = [];
    const childrenOf = new Map<string, RGANode[]>();

    // Group all nodes by their parent (leftOrigin)
    for (const node of this.nodes.values()) {
      if (node.id.clientId === ROOT_ID.clientId && node.id.clock === ROOT_ID.clock) {
        continue;
      }
      const parentKey = node.leftOrigin ? idToKey(node.leftOrigin) : 'root';
      if (!childrenOf.has(parentKey)) {
        childrenOf.set(parentKey, []);
      }
      childrenOf.get(parentKey)!.push(node);
    }

    // Sort sibling nodes by ID to ensure deterministic order (smaller ID wins)
    for (const children of childrenOf.values()) {
      children.sort((a, b) => compareIDs(a.id, b.id));
    }

    // Depth-first traversal from the root node
    const traverse = (nodeId: ID) => {
      const key = idToKey(nodeId);
      const children = childrenOf.get(key);
      if (!children) return;

      for (const child of children) {
        result.push(child);
        traverse(child.id);
      }
    };

    traverse(ROOT_ID);
    return result;
  }

  toString(): string {
    const ordered = this.getNodesInOrder();
    return ordered
      .filter(n => !n.deleted)
      .map(n => n.char)
      .join('');
  }

  // ==================== Internal Helpers ====================

  private findOriginsAtPosition(position: number): [ID, ID | null] {
    const ordered = this.getNodesInOrder();
    let visibleCount = 0;
    let lastVisibleId = ROOT_ID;

    for (const node of ordered) {
      if (!node.deleted) {
        if (visibleCount === position) {
          return [lastVisibleId, node.id];
        }
        visibleCount++;
        lastVisibleId = node.id;
      }
    }

    return [lastVisibleId, null];
  }

  private getVisibleNodeAtPosition(position: number): RGANode | null {
    const ordered = this.getNodesInOrder();
    let visibleCount = 0;

    for (const node of ordered) {
      if (!node.deleted) {
        if (visibleCount === position) {
          return node;
        }
        visibleCount++;
      }
    }
    return null;
  }

  private integrate(newNode: RGANode): void {
    this.nodes.set(idToKey(newNode.id), newNode);
  }

  // ==================== Debugging / Inspection ====================

  /**
   * Returns all nodes (including tombstones) in tree order.
   */
  getAllNodes(): RGANode[] {
    return [this.nodes.get(idToKey(ROOT_ID))!, ...this.getNodesInOrder()];
  }

  getClientId(): ClientID {
    return this.clientId;
  }
}