/**
 * C++ Implementation: Bridges & Articulation Points
 * Invariant: O(V + E) low-link DFS tree traversal
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class BridgesArticulationPoints {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
