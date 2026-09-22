/*
 * C Implementation: Shortest Paths (Dijkstra, Bellman-Ford, Floyd-Warshall)
 * Invariant: Dijkstra O((V+E) log V), Floyd O(V^3)
 */
#include <stdio.h>
#include <stdlib.h>

typedef struct {
    int* data;
    int size;
    int capacity;
} shortest_paths_t;

// TODO: Complete the allocation and operations
void init_shortest_paths(shortest_paths_t* item, int capacity) {
    item->data = (int*)malloc(capacity * sizeof(int));
    item->size = 0;
    item->capacity = capacity;
}
