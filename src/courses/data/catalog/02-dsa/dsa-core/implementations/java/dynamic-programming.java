/**
 * Java Implementation: Dynamic Programming
 * Invariant: Optimal Substructure + Overlapping Subproblems
 */
package seed.dsa.core;

import java.util.*;

public class DynamicProgramming<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
