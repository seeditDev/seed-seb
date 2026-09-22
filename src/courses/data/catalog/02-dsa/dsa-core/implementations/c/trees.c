/*
 * C Implementation: Trees (Binary Tree & Traversals)
 * Invariant: Traversals O(N), Depth O(log N) to O(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} trees_t;

// TODO: Complete the allocation and operations
void init_trees(trees_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
