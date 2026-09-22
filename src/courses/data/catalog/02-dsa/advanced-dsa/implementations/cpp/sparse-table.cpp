/**
 * C++ Implementation: Sparse Table (Range Minimum Query)
 * Invariant: Precomputation O(N log N), Range Query O(1)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class SparseTableRangeMinimumQuery {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
