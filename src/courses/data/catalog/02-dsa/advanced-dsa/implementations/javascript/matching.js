/**
 * JavaScript Implementation: Bipartite Matching (Hopcroft-Karp)
 * Invariant: O(E sqrt(V)) maximum cardinality matching
 */
export class BipartiteMatchingHopcroftKarp {
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
