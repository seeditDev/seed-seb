/**
 * JavaScript Implementation: Divide & Conquer
 * Invariant: Master Theorem: T(N) = aT(N/b) + f(N)
 */
export class DivideConquer {
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
