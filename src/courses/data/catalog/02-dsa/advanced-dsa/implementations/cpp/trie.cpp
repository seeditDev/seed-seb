/**
 * C++ Implementation: Trie (Prefix Tree)
 * Invariant: Prefix search O(Length of Word)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class TriePrefixTree {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
