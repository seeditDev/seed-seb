/**
 * JavaScript Implementation: Sparse Table (Range Minimum Query)
 * Invariant: Precomputation O(N log N), Range Query O(1)
 */
export class SparseTableRangeMinimumQuery {
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
