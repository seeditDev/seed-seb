/**
 * JavaScript Implementation: Randomized Algorithms (Treap, Skip List)
 * Invariant: Expected O(log N) with high probability
 */
export class RandomizedAlgorithmsTreapSkipList {
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
