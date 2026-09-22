/**
 * C++ Implementation: Minimum Spanning Tree (Kruskal & Prim)
 * Invariant: O(E log V) with Disjoint Set Union
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class MinimumSpanningTreeKruskalPrim {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
