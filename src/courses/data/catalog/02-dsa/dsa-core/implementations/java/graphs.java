/**
 * Java Implementation: Graphs (BFS & DFS Traversals)
 * Invariant: Time O(V + E), Space O(V)
 */
package seed.dsa.core;

import java.util.*;

public class GraphsBFSDFSTraversals<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
