/**
 * Java Implementation: Shortest Paths (Dijkstra, Bellman-Ford, Floyd-Warshall)
 * Invariant: Dijkstra O((V+E) log V), Floyd O(V^3)
 */
package seed.dsa.core;

import java.util.*;

public class ShortestPathsDijkstraBellmanFordFloydWarshall<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
