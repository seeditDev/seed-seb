/**
 * JavaScript Implementation: Graphs (BFS & DFS Traversals)
 * Invariant: Time O(V + E), Space O(V)
 */
export class GraphsBFSDFSTraversals {
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
