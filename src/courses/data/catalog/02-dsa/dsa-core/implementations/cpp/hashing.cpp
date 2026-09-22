/**
 * C++ Implementation: Hashing (Hash Table & Map)
 * Invariant: Amortized O(1) Lookup/Insert/Delete
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class HashingHashTableMap {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
