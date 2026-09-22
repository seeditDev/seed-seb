/**
 * C++ Implementation: Trees (Binary Tree & Traversals)
 * Invariant: Traversals O(N), Depth O(log N) to O(N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class TreesBinaryTreeTraversals {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
