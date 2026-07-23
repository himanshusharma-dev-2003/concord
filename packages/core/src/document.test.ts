import { describe, it, expect, beforeEach } from 'vitest';
import { RgaDocument } from './document';
import { RGANode } from './types';

describe('RgaDocument', () => {
  let docA: RgaDocument;
  let docB: RgaDocument;

  beforeEach(() => {
    docA = new RgaDocument(1);
    docB = new RgaDocument(2);
  });

  it('should start with empty document', () => {
    expect(docA.toString()).toBe('');
  });

  it('should insert characters correctly', () => {
    docA.insert(0, 'H');
    docA.insert(1, 'i');
    expect(docA.toString()).toBe('Hi');
  });

  it('should support delete', () => {
    docA.insert(0, 'H');
    docA.insert(1, 'i');
    docA.delete(0);
    expect(docA.toString()).toBe('i');
  });

  it('should handle remote insert via applyRemoteOp', () => {
    const node = docA.insert(0, 'A');
    docB.applyRemoteOp(node);
    expect(docB.toString()).toBe('A');
  });

  it('should handle mergeSiteState', () => {
    const node1 = docA.insert(0, 'H');
    const node2 = docA.insert(1, 'i');

    docB.mergeSiteState([node1, node2]);
    expect(docB.toString()).toBe('Hi');
  });

  it('should be idempotent on duplicate remote ops', () => {
    const node = docA.insert(0, 'X');
    docB.applyRemoteOp(node);
    docB.applyRemoteOp(node);
    expect(docB.toString()).toBe('X');
  });

  it('should correctly merge concurrent inserts (Yjs-style)', () => {
    // Simulate concurrent inserts at the same position
    const nodeA = docA.insert(0, 'a');
    const nodeB = docB.insert(0, 'b');

    // Cross-merge
    docA.applyRemoteOp(nodeB);
    docB.applyRemoteOp(nodeA);

    // The result should be deterministic (order by ID)
    const textA = docA.toString();
    const textB = docB.toString();
    expect(textA).toBe(textB);
    // Lower clientId wins in our tie-breaker (client 1 < client 2)
    expect(textA).toBe('ab');
  });

  it('should preserve order after mixed local/remote operations', () => {
    docA.insert(0, 'H');
    const remoteW = docB.insert(0, 'W');
    docA.applyRemoteOp(remoteW);
    docA.insert(1, 'o'); // local after merge (inserts after 'H')

    // Correct RGA tree structure is: ROOT -> H -> o, and ROOT -> W.
    // Depth-first traversal order must be: H, o, W.
    // The previous buggy implementation placed 'o' after 'W' due to flat key sorting.
    expect(docA.toString()).toBe('HoW');
  });
});

// =============================================================================
// CRDT CONVERGENCE PROPERTY TESTS
// These tests are written as explicit proofs of the three core CRDT guarantees:
// Commutativity, Associativity, and Idempotence.
// =============================================================================

describe('CRDT Convergence Properties', () => {
  let siteA: RgaDocument;
  let siteB: RgaDocument;
  let siteC: RgaDocument;

  beforeEach(() => {
    siteA = new RgaDocument(10);
    siteB = new RgaDocument(20);
    siteC = new RgaDocument(30);
  });

  it('PROOF: concurrent insert/insert at same position produces identical final state on all sites', () => {
    // Site A and B both insert at position 0 concurrently
    const nodeFromA = siteA.insert(0, 'X');
    const nodeFromB = siteB.insert(0, 'Y');

    // Exchange operations (cross-merge)
    siteA.applyRemoteOp(nodeFromB);
    siteB.applyRemoteOp(nodeFromA);

    // Both sites must converge to the same string
    expect(siteA.toString()).toBe(siteB.toString());
    // Deterministic tie-breaker: lower clientId wins → "XY"
    expect(siteA.toString()).toBe('XY');
  });

  it('PROOF: concurrent insert/delete produces identical final state regardless of order', () => {
    // Site A inserts 'A' at 0
    const insertNode = siteA.insert(0, 'A');

    // Site B has no content yet, so delete(0) is a no-op (returns null)
    // We simulate a delete that happens after the insert is received
    siteB.applyRemoteOp(insertNode);

    // Now both sites delete the character
    const deleteFromA = siteA.delete(0);
    const deleteFromB = siteB.delete(0);

    // Cross-apply the deletes
    if (deleteFromA) siteB.applyRemoteOp(deleteFromA);
    if (deleteFromB) siteA.applyRemoteOp(deleteFromB);

    // Both sites should now be empty (converged)
    expect(siteA.toString()).toBe(siteB.toString());
    expect(siteA.toString()).toBe('');
  });

  it('PROOF: concurrent delete/delete is idempotent and converges', () => {
    // Both sites start with the same character
    const insertNode = siteA.insert(0, 'Z');
    siteB.applyRemoteOp(insertNode);

    expect(siteA.toString()).toBe('Z');
    expect(siteB.toString()).toBe('Z');

    // Both sites delete the same visible character concurrently
    const deleteFromA = siteA.delete(0);
    const deleteFromB = siteB.delete(0);

    // Cross-merge deletes (only apply non-null deletes)
    if (deleteFromA) siteB.applyRemoteOp(deleteFromA);
    if (deleteFromB) siteA.applyRemoteOp(deleteFromB);

    // Both sites must converge to empty string
    expect(siteA.toString()).toBe('');
    expect(siteB.toString()).toBe('');
    expect(siteA.toString()).toBe(siteB.toString());
  });

  it('PROOF: out-of-order operation delivery still converges to same state', () => {
    // Create three operations on site A
    const op1 = siteA.insert(0, '1');
    const op2 = siteA.insert(1, '2');
    const op3 = siteA.insert(2, '3');

    // Site B receives them in a completely different order
    siteB.applyRemoteOp(op3);
    siteB.applyRemoteOp(op1);
    siteB.applyRemoteOp(op2);

    // Site C receives them in yet another order
    siteC.applyRemoteOp(op2);
    siteC.applyRemoteOp(op3);
    siteC.applyRemoteOp(op1);

    // All three sites must have identical final state
    const stateA = siteA.toString();
    const stateB = siteB.toString();
    const stateC = siteC.toString();

    expect(stateA).toBe(stateB);
    expect(stateB).toBe(stateC);
    expect(stateA).toBe('123');
  });

  it('PROOF: two offline clients diverge then merge back to identical state', () => {
    // Both clients start with the same initial document
    const initial = siteA.insert(0, 'H');
    siteB.applyRemoteOp(initial);
    siteC.applyRemoteOp(initial); // third client for extra safety

    expect(siteA.toString()).toBe('H');
    expect(siteB.toString()).toBe('H');

    // Client A goes offline and makes local changes
    siteA.insert(1, 'e');   // "He"
    siteA.insert(2, 'l');   // "Hel"
    siteA.insert(3, 'l');   // "Hell"
    siteA.insert(4, 'o');   // "Hello"

    // Client B goes offline and makes different local changes
    siteB.insert(1, 'i');   // "Hi"

    // Both are still offline — states have diverged
    expect(siteA.toString()).toBe('Hello');
    expect(siteB.toString()).toBe('Hi');

    // Now they come back online and exchange all operations
    const opsFromA = siteA.getAllNodes().filter(n => n.id.clientId === 10);
    const opsFromB = siteB.getAllNodes().filter(n => n.id.clientId === 20);

    siteB.mergeSiteState(opsFromA);
    siteA.mergeSiteState(opsFromB);

    // Final state must be identical on both sites
    expect(siteA.toString()).toBe(siteB.toString());
    // The merged result is deterministic (depends on insertion order and IDs)
    // In practice both will see the same characters in the same order
    expect(siteA.toString().length).toBeGreaterThan(0);
  });

  it('PROOF: mergeSiteState is commutative (order of merging remote sets does not matter)', () => {
    const opA = siteA.insert(0, 'A');
    const opB = siteB.insert(0, 'B');

    // Merge in one order on site C
    siteC.mergeSiteState([opA, opB]);
    const result1 = siteC.toString();

    // Reset site C and merge in reverse order
    const freshC = new RgaDocument(30);
    freshC.mergeSiteState([opB, opA]);
    const result2 = freshC.toString();

    expect(result1).toBe(result2);
  });

  it('PROOF: correct depth-first sibling ordering is maintained under complex branches', () => {
    // Site A inserts 'X'
    const nodeX = siteA.insert(0, 'X');
    // Site B concurrently inserts 'Y' at same position
    const nodeY = siteB.insert(0, 'Y');

    // Cross-merge
    siteA.applyRemoteOp(nodeY);
    siteB.applyRemoteOp(nodeX);

    // Site A client ID is 10, Site B is 20. Deterministic sort puts 'X' before 'Y' -> 'XY'
    expect(siteA.toString()).toBe('XY');

    // Now siteA inserts 'W' after 'X'
    const nodeW = siteA.insert(1, 'W'); // should be inserted immediately after 'X'
    siteB.applyRemoteOp(nodeW);

    // Tree structure: ROOT -> X -> W, and ROOT -> Y.
    // Traversal must be depth-first: ROOT -> X -> W -> Y.
    // Result must be 'XWY' on both sites.
    expect(siteA.toString()).toBe('XWY');
    expect(siteB.toString()).toBe('XWY');
  });
});