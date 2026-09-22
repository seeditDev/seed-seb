/**
 * Java Implementation: Segment Tree
 * Invariant: Range Query O(log N), Point/Range Update O(log N)
 */
package seed.dsa.core;

import java.util.*;

public class SegmentTree<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
