/**
 * JavaScript Implementation: Greedy Algorithms
 * Invariant: Locally optimal choice yields globally optimal solution
 */
export class GreedyAlgorithms {
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
