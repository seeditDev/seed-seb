/**
 * Java Implementation: Minimum Spanning Tree (Kruskal & Prim)
 * Invariant: O(E log V) with Disjoint Set Union
 */
package seed.dsa.core;

import java.util.*;

public class MinimumSpanningTreeKruskalPrim<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
