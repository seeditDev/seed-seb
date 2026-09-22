/**
 * Java Implementation: Fenwick Tree (Binary Indexed Tree)
 * Invariant: Prefix Sum O(log N), Update O(log N), Space O(N)
 */
package seed.dsa.core;

import java.util.*;

public class FenwickTreeBinaryIndexedTree<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
