/**
 * Java Implementation: Backtracking
 * Invariant: Pruned state space exploration, O(b^d)
 */
package seed.dsa.core;

import java.util.*;

public class Backtracking<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
