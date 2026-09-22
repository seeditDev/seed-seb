/**
 * C++ Implementation: Queue
 * Invariant: Enqueue/Dequeue O(1), Space O(N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class Queue {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
