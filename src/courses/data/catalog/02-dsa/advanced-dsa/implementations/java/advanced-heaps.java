/**
 * Java Implementation: Advanced Heaps (Fibonacci, Binomial)
 * Invariant: Amortized O(1) decrease-key, O(log N) delete
 */
package seed.dsa.core;

import java.util.*;

public class AdvancedHeapsFibonacciBinomial<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
