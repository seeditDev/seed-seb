/*
 * C Implementation: Sparse Table (Range Minimum Query)
 * Invariant: Precomputation O(N log N), Range Query O(1)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} sparse_table_t;

// TODO: Complete the allocation and operations
void init_sparse_table(sparse_table_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
