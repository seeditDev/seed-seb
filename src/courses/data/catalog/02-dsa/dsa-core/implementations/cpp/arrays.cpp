/**
 * C++ Implementation: Arrays
 * Invariant: Access O(1), Search O(N), Insert/Delete O(N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class Arrays {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
