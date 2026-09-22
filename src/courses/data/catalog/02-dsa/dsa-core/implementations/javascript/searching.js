/**
 * JavaScript Implementation: Searching (Linear & Binary)
 * Invariant: Linear O(N), Binary O(log N)
 */
export class SearchingLinearBinary {
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
