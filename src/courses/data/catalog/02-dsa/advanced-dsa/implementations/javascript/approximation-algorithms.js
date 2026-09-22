/**
 * JavaScript Implementation: Approximation Algorithms (Vertex Cover, TSP)
 * Invariant: Polynomial time bounded factor approximation
 */
export class ApproximationAlgorithmsVertexCoverTSP {
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
