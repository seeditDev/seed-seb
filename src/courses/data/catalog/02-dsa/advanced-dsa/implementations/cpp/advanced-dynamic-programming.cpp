/**
 * C++ Implementation: Advanced DP (Bitmask, Tree DP, SOS DP)
 * Invariant: Exponential state spaces compressed onto ints
 */
#include <iostream>
#include <vector>
#include <stdexcept>

template <typename T>
class AdvancedDPBitmaskTreeDPSOSDP {
private:
    std::vector<T> elements;
public:
    // TODO: Implement primary invariant operations
    void push(const T& val) {
        elements.push_back(val);
    }
    size_t size() const { return elements.size(); }
};
