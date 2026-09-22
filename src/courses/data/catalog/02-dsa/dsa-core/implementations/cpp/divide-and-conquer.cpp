/**
 * C++ Implementation: Divide & Conquer
 * Invariant: Master Theorem: T(N) = aT(N/b) + f(N)
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class DivideConquer {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
