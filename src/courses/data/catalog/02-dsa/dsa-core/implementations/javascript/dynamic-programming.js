/**
 * JavaScript Implementation: Dynamic Programming
 * Invariant: Optimal Substructure + Overlapping Subproblems
 */
export class DynamicProgramming {
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
