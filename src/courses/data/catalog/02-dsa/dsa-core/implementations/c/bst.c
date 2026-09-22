/*
 * C Implementation: Binary Search Tree (BST)
 * Invariant: Balanced O(log N) Search/Insert, Degenerate O(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} bst_t;

// TODO: Complete the allocation and operations
void init_bst(bst_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
