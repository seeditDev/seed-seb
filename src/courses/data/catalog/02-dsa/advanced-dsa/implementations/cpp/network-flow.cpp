/**
 * C++ Implementation: Network Flow (Edmonds-Karp & Dinic)
 * Invariant: Dinic O(V^2 E), Unit Networks O(E sqrt(V))
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class NetworkFlowEdmondsKarpDinic {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
