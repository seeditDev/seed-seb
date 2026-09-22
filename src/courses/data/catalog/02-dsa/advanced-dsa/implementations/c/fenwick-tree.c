/*
 * C Implementation: Fenwick Tree (Binary Indexed Tree)
 * Invariant: Prefix Sum O(log N), Update O(log N), Space O(N)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} fenwick_tree_t;

// TODO: Complete the allocation and operations
void init_fenwick_tree(fenwick_tree_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
