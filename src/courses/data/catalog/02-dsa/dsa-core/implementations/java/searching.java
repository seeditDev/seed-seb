/**
 * Java Implementation: Searching (Linear & Binary)
 * Invariant: Linear O(N), Binary O(log N)
 */
package seed.dsa.core;

import java.util.*;

public class SearchingLinearBinary<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
