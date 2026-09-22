/*
 * C Implementation: Graphs (BFS & DFS Traversals)
 * Invariant: Time O(V + E), Space O(V)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} graphs_t;

// TODO: Complete the allocation and operations
void init_graphs(graphs_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
