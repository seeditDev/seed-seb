/**
 * JavaScript Implementation: Stack
 * Invariant: Push/Pop/Peek O(1), Space O(N)
 */
export class Stack {
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
