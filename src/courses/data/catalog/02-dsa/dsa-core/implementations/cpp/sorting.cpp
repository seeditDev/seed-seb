/**
 * C++ Implementation: Sorting (Quick, Merge, Heap)
 * Invariant: Comparison O(N log N), Space O(1) to O(N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class SortingQuickMergeHeap {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
