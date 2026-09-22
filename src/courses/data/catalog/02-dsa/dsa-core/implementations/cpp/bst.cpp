/**
 * C++ Implementation: Binary Search Tree (BST)
 * Invariant: Balanced O(log N) Search/Insert, Degenerate O(N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class BinarySearchTreeBST {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
