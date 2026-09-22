/**
 * Java Implementation: Advanced Trees (AVL, Red-Black)
 * Invariant: Guaranteed O(log N) worst-case height
 */
package seed.dsa.core;

import java.util.*;

public class AdvancedTreesAVLRedBlack<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
