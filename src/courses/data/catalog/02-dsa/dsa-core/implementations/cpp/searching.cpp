/**
 * C++ Implementation: Searching (Linear & Binary)
 * Invariant: Linear O(N), Binary O(log N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class SearchingLinearBinary {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
