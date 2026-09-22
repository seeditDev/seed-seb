/*
 * C Implementation: Strongly Connected Components (Tarjan & Kosaraju)
 * Invariant: O(V + E) single or double DFS passes
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} scc_t;

// TODO: Complete the allocation and operations
void init_scc(scc_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
