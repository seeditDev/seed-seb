/**
 * C++ Implementation: Linked Lists
 * Invariant: Insert/Delete O(1) given pointer, Search O(N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class LinkedLists {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
