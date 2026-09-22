/**
 * JavaScript Implementation: Backtracking
 * Invariant: Pruned state space exploration, O(b^d)
 */
export class Backtracking {
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
