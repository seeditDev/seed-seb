/**
 * Java Implementation: Strings
 * Invariant: Access O(1), Search O(N), Slice O(K)
 */
package seed.dsa.core;

import java.util.*;

public class Strings<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
