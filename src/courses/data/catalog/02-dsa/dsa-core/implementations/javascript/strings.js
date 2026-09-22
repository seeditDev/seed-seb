/**
 * JavaScript Implementation: Strings
 * Invariant: Access O(1), Search O(N), Slice O(K)
 */
export class Strings {
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
