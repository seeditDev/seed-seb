/**
 * Java Implementation: Randomized Algorithms (Treap, Skip List)
 * Invariant: Expected O(log N) with high probability
 */
package seed.dsa.core;

import java.util.*;

public class RandomizedAlgorithmsTreapSkipList<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
