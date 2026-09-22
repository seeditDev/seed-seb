/**
 * C++ Implementation: Backtracking
 * Invariant: Pruned state space exploration, O(b^d)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class Backtracking {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
