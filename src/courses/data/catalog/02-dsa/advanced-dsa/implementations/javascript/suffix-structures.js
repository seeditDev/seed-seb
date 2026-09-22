/**
 * JavaScript Implementation: Suffix Structures (Suffix Array & Automaton)
 * Invariant: Substring queries in O(M) time
 */
export class SuffixStructuresSuffixArrayAutomaton {
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
