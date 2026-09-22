/**
 * Java Implementation: Sorting (Quick, Merge, Heap)
 * Invariant: Comparison O(N log N), Space O(1) to O(N)
 */
package seed.dsa.core;

import java.util.*;

public class SortingQuickMergeHeap<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
