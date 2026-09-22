/**
 * JavaScript Implementation: Linked Lists
 * Invariant: Insert/Delete O(1) given pointer, Search O(N)
 */
export class LinkedLists {
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
