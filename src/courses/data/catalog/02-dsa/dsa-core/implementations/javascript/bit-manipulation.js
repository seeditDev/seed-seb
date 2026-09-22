/**
 * JavaScript Implementation: Bit Manipulation
 * Invariant: Bitwise AND, OR, XOR, Shifts O(1)
 */
export class BitManipulation {
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
