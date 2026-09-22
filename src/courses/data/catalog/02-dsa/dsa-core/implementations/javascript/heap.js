/**
 * JavaScript Implementation: Heap & Priority Queue
 * Invariant: Insert O(log N), ExtractMin O(log N), Peek O(1)
 */
export class HeapPriorityQueue {
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
