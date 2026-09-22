/**
 * Java Implementation: Stack
 * Invariant: Push/Pop/Peek O(1), Space O(N)
 */
package seed.dsa.core;

import java.util.*;

public class Stack<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
