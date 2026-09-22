/**
 * C++ Implementation: Segment Tree
 * Invariant: Range Query O(log N), Point/Range Update O(log N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class SegmentTree {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
