/**
 * JavaScript Implementation: Queue
 * Invariant: Enqueue/Dequeue O(1), Space O(N)
 */
export class Queue {
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
