/**
 * Java Implementation: Greedy Algorithms
 * Invariant: Locally optimal choice yields globally optimal solution
 */
package seed.dsa.core;

import java.util.*;

public class GreedyAlgorithms<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
