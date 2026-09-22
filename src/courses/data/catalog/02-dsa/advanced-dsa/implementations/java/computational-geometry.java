/**
 * Java Implementation: Computational Geometry (Convex Hull, Line Sweep)
 * Invariant: Graham Scan O(N log N), Cross products
 */
package seed.dsa.core;

import java.util.*;

public class ComputationalGeometryConvexHullLineSweep<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
