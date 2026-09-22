/*
 * C Implementation: Randomized Algorithms (Treap, Skip List)
 * Invariant: Expected O(log N) with high probability
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} randomized_algorithms_t;

// TODO: Complete the allocation and operations
void init_randomized_algorithms(randomized_algorithms_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
