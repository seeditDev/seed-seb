/**
 * Java Implementation: Hashing (Hash Table & Map)
 * Invariant: Amortized O(1) Lookup/Insert/Delete
 */
package seed.dsa.core;

import java.util.*;

public class HashingHashTableMap<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
