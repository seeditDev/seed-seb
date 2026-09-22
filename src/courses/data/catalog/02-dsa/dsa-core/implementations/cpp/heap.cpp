/**
 * C++ Implementation: Heap & Priority Queue
 * Invariant: Insert O(log N), ExtractMin O(log N), Peek O(1)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class HeapPriorityQueue {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
