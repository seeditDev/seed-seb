/**
 * JavaScript Implementation: Trees (Binary Tree & Traversals)
 * Invariant: Traversals O(N), Depth O(log N) to O(N)
 */
export class TreesBinaryTreeTraversals {
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
