/**
 * Java Implementation: Trie (Prefix Tree)
 * Invariant: Prefix search O(Length of Word)
 */
package seed.dsa.core;

import java.util.*;

public class TriePrefixTree<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
