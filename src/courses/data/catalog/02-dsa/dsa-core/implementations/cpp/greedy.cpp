/**
 * C++ Implementation: Greedy Algorithms
 * Invariant: Locally optimal choice yields globally optimal solution
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class GreedyAlgorithms {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
