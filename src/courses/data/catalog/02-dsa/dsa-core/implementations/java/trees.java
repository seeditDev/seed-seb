/**
 * Java Implementation: Trees (Binary Tree & Traversals)
 * Invariant: Traversals O(N), Depth O(log N) to O(N)
 */
package seed.dsa.core;

import java.util.*;

public class TreesBinaryTreeTraversals<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
