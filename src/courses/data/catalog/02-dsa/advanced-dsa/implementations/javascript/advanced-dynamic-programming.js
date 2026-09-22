/**
 * JavaScript Implementation: Advanced DP (Bitmask, Tree DP, SOS DP)
 * Invariant: Exponential state spaces compressed onto ints
 */
export class AdvancedDPBitmaskTreeDPSOSDP {
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
