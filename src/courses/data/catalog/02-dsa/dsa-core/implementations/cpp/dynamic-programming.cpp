/**
 * C++ Implementation: Dynamic Programming
 * Invariant: Optimal Substructure + Overlapping Subproblems
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class DynamicProgramming {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
