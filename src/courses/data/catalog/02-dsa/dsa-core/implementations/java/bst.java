/**
 * Java Implementation: Binary Search Tree (BST)
 * Invariant: Balanced O(log N) Search/Insert, Degenerate O(N)
 */
package seed.dsa.core;

import java.util.*;

public class BinarySearchTreeBST<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
