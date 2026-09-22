/**
 * C++ Implementation: Graphs (BFS & DFS Traversals)
 * Invariant: Time O(V + E), Space O(V)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class GraphsBFSDFSTraversals {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
