/**
 * JavaScript Implementation: Arrays
 * Invariant: Access O(1), Search O(N), Insert/Delete O(N)
 */
export class Arrays {
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
