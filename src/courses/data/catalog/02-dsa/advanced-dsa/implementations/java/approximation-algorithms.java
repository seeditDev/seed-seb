/**
 * Java Implementation: Approximation Algorithms (Vertex Cover, TSP)
 * Invariant: Polynomial time bounded factor approximation
 */
package seed.dsa.core;

import java.util.*;

public class ApproximationAlgorithmsVertexCoverTSP<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
