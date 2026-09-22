/**
 * Java Implementation: Bridges & Articulation Points
 * Invariant: O(V + E) low-link DFS tree traversal
 */
package seed.dsa.core;

import java.util.*;

public class BridgesArticulationPoints<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
