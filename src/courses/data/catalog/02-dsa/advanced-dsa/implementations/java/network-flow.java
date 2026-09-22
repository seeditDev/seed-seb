/**
 * Java Implementation: Network Flow (Edmonds-Karp & Dinic)
 * Invariant: Dinic O(V^2 E), Unit Networks O(E sqrt(V))
 */
package seed.dsa.core;

import java.util.*;

public class NetworkFlowEdmondsKarpDinic<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
