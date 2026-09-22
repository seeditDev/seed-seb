/**
 * Java Implementation: Recursion
 * Invariant: Call Stack O(Depth), Work O(Branch^Depth)
 */
package seed.dsa.core;

import java.util.*;

public class Recursion<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
