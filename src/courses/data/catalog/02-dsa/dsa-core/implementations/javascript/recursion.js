/**
 * JavaScript Implementation: Recursion
 * Invariant: Call Stack O(Depth), Work O(Branch^Depth)
 */
export class Recursion {
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
