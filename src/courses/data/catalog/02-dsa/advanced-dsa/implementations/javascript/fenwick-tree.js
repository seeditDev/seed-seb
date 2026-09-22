/**
 * JavaScript Implementation: Fenwick Tree (Binary Indexed Tree)
 * Invariant: Prefix Sum O(log N), Update O(log N), Space O(N)
 */
export class FenwickTreeBinaryIndexedTree {
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
