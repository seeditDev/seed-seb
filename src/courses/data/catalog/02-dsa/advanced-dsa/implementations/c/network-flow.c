/*
 * C Implementation: Network Flow (Edmonds-Karp & Dinic)
 * Invariant: Dinic O(V^2 E), Unit Networks O(E sqrt(V))
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} network_flow_t;

// TODO: Complete the allocation and operations
void init_network_flow(network_flow_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
