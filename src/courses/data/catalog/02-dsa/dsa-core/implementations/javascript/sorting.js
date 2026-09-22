/**
 * JavaScript Implementation: Sorting (Quick, Merge, Heap)
 * Invariant: Comparison O(N log N), Space O(1) to O(N)
 */
export class SortingQuickMergeHeap {
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
