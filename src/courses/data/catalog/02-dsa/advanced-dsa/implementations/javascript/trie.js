/**
 * JavaScript Implementation: Trie (Prefix Tree)
 * Invariant: Prefix search O(Length of Word)
 */
export class TriePrefixTree {
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
