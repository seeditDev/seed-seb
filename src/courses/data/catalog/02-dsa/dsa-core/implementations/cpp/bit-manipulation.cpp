/**
 * C++ Implementation: Bit Manipulation
 * Invariant: Bitwise AND, OR, XOR, Shifts O(1)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class BitManipulation {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
