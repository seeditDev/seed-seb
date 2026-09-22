/**
 * Java Implementation: Bit Manipulation
 * Invariant: Bitwise AND, OR, XOR, Shifts O(1)
 */
package seed.dsa.core;

import java.util.*;

public class BitManipulation<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
