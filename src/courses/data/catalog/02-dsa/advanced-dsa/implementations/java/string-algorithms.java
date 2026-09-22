/**
 * Java Implementation: String Algorithms (KMP, Z-Algorithm, Aho-Corasick)
 * Invariant: Linear time O(N + M) pattern matching
 */
package seed.dsa.core;

import java.util.*;

public class StringAlgorithmsKMPZAlgorithmAhoCorasick<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
