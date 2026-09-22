/**
 * C++ Implementation: Strongly Connected Components (Tarjan & Kosaraju)
 * Invariant: O(V + E) single or double DFS passes
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class StronglyConnectedComponentsTarjanKosaraju {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
