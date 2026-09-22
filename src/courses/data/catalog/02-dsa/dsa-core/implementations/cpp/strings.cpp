/**
 * C++ Implementation: Strings
 * Invariant: Access O(1), Search O(N), Slice O(K)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class Strings {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
