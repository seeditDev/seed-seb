/*
 * C Implementation: Minimum Spanning Tree (Kruskal & Prim)
 * Invariant: O(E log V) with Disjoint Set Union
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} mst_t;

// TODO: Complete the allocation and operations
void init_mst(mst_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
