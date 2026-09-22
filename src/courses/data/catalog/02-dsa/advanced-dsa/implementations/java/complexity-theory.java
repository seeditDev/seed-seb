/**
 * Java Implementation: Complexity Theory (P vs NP, Reductions)
 * Invariant: Karp reductions, NP-Completeness proofs
 */
package seed.dsa.core;

import java.util.*;

public class ComplexityTheoryPvsNPReductions<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
