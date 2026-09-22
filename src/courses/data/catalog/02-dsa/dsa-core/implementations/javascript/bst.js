/**
 * JavaScript Implementation: Binary Search Tree (BST)
 * Invariant: Balanced O(log N) Search/Insert, Degenerate O(N)
 */
export class BinarySearchTreeBST {
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
