/**
 * C++ Implementation: Recursion
 * Invariant: Call Stack O(Depth), Work O(Branch^Depth)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class Recursion {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
