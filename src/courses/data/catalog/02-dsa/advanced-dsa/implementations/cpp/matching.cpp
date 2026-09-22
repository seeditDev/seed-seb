/**
 * C++ Implementation: Bipartite Matching (Hopcroft-Karp)
 * Invariant: O(E sqrt(V)) maximum cardinality matching
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class BipartiteMatchingHopcroftKarp {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
