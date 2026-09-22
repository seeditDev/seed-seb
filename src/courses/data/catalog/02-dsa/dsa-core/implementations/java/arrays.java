/**
 * Java Implementation: Arrays
 * Invariant: Access O(1), Search O(N), Insert/Delete O(N)
 */
package seed.dsa.core;

import java.util.*;

public class Arrays<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
