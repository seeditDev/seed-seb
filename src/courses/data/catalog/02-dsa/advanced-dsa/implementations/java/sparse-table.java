/**
 * Java Implementation: Sparse Table (Range Minimum Query)
 * Invariant: Precomputation O(N log N), Range Query O(1)
 */
package seed.dsa.core;

import java.util.*;

public class SparseTableRangeMinimumQuery<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
