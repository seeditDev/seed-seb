/*
 * C Implementation: Sorting (Quick, Merge, Heap)
 * Invariant: Comparison O(N log N), Space O(1) to O(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} sorting_t;

// TODO: Complete the allocation and operations
void init_sorting(sorting_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
