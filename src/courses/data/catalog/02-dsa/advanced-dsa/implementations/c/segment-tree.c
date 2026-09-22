/*
 * C Implementation: Segment Tree
 * Invariant: Range Query O(log N), Point/Range Update O(log N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} segment_tree_t;

// TODO: Complete the allocation and operations
void init_segment_tree(segment_tree_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
