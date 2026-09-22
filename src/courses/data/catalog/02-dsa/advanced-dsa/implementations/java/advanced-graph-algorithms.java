/**
 * Java Implementation: Advanced Graph Algorithms
 * Invariant: Topological sort, 2-SAT, Eulerian circuits
 */
package seed.dsa.core;

import java.util.*;

public class AdvancedGraphAlgorithms<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
