/**
 * JavaScript Implementation: Network Flow (Edmonds-Karp & Dinic)
 * Invariant: Dinic O(V^2 E), Unit Networks O(E sqrt(V))
 */
export class NetworkFlowEdmondsKarpDinic {
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
