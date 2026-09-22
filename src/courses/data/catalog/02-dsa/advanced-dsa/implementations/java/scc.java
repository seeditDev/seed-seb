/**
 * Java Implementation: Strongly Connected Components (Tarjan & Kosaraju)
 * Invariant: O(V + E) single or double DFS passes
 */
package seed.dsa.core;

import java.util.*;

public class StronglyConnectedComponentsTarjanKosaraju<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
