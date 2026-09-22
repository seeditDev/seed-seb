/*
 * C Implementation: Advanced DP (Bitmask, Tree DP, SOS DP)
 * Invariant: Exponential state spaces compressed onto ints
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} advanced_dynamic_programming_t;

// TODO: Complete the allocation and operations
void init_advanced_dynamic_programming(advanced_dynamic_programming_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
