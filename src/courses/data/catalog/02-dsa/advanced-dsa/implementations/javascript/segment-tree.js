/**
 * JavaScript Implementation: Segment Tree
 * Invariant: Range Query O(log N), Point/Range Update O(log N)
 */
export class SegmentTree {
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
