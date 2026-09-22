/**
 * Java Implementation: Bipartite Matching (Hopcroft-Karp)
 * Invariant: O(E sqrt(V)) maximum cardinality matching
 */
package seed.dsa.core;

import java.util.*;

public class BipartiteMatchingHopcroftKarp<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
