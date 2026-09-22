/**
 * Java Implementation: Suffix Structures (Suffix Array & Automaton)
 * Invariant: Substring queries in O(M) time
 */
package seed.dsa.core;

import java.util.*;

public class SuffixStructuresSuffixArrayAutomaton<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
