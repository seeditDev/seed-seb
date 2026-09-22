/**
 * JavaScript Implementation: Strongly Connected Components (Tarjan & Kosaraju)
 * Invariant: O(V + E) single or double DFS passes
 */
export class StronglyConnectedComponentsTarjanKosaraju {
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
