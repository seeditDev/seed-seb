/**
 * Java Implementation: Heap & Priority Queue
 * Invariant: Insert O(log N), ExtractMin O(log N), Peek O(1)
 */
package seed.dsa.core;

import java.util.*;

public class HeapPriorityQueue<T> {
    private final List<T> items = new ArrayList<>();

    // TODO: Implement your solution here
    public void add(T value) {
        items.add(value);
    }

    public int size() {
        return items.size();
    }
}
