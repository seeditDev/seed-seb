/**
 * C++ Implementation: Shortest Paths (Dijkstra, Bellman-Ford, Floyd-Warshall)
 * Invariant: Dijkstra O((V+E) log V), Floyd O(V^3)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class ShortestPathsDijkstraBellmanFordFloydWarshall {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
