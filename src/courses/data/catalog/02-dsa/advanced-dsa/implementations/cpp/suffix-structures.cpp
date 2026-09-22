/**
 * C++ Implementation: Suffix Structures (Suffix Array & Automaton)
 * Invariant: Substring queries in O(M) time
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class SuffixStructuresSuffixArrayAutomaton {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
