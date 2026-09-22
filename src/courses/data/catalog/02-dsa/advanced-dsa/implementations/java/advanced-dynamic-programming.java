/**
 * Java Implementation: Advanced DP (Bitmask, Tree DP, SOS DP)
 * Invariant: Exponential state spaces compressed onto ints
 */
package seed.dsa.core;

import java.util.*;

public class AdvancedDPBitmaskTreeDPSOSDP<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
