/**
 * JavaScript Implementation: Hashing (Hash Table & Map)
 * Invariant: Amortized O(1) Lookup/Insert/Delete
 */
export class HashingHashTableMap {
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
