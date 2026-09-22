/**
 * Java Implementation: Divide & Conquer
 * Invariant: Master Theorem: T(N) = aT(N/b) + f(N)
 */
package seed.dsa.core;

import java.util.*;

public class DivideConquer<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
