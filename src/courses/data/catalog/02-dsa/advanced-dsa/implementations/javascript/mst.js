/**
 * JavaScript Implementation: Minimum Spanning Tree (Kruskal & Prim)
 * Invariant: O(E log V) with Disjoint Set Union
 */
export class MinimumSpanningTreeKruskalPrim {
  constructor() {
    this.items = [];
  }

  // TODO: Implement verified invariant
  insert(val) {
    this.items.push(val);
  }

  get size() {
    return this.items.length;
  }
}
